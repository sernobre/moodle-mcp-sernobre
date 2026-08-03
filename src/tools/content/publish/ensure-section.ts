import type { Section } from '../../../schemas/moodle-responses.js';
import type { Plan } from '../../../adapters/lesson-to-moodle.js';
import { MoodleWsError } from '../../../client/errors.js';
import type { ToolContext } from '../../types.js';
import type { ExecuteContext, ExecuteResult } from './types.js';

/**
 * Locate (or create) the Moodle section a lesson should be published into,
 * and make sure it has the requested visibility. `plan.section.idnumber`
 * is the stable identity; the section itself is matched by its contents
 * because Moodle core WS does not expose a section `idnumber`.
 */

interface EnsureSectionArgs {
  contents: Section[];
  plan: Plan;
  exec: ExecuteContext;
  warnings: string[];
}

export async function ensureSection(
  ctx: ToolContext,
  { contents, plan, exec, warnings }: EnsureSectionArgs,
): Promise<{
  section: ExecuteResult['section'];
  status: 'created' | 'updated';
}> {
  // 1. Explicit override wins (caller asked for a specific section).
  if (exec.sectionIdOverride !== undefined) {
    const target = contents.find((s) => s.id === exec.sectionIdOverride);
    if (!target) {
      throw new MoodleWsError(
        `section_id ${exec.sectionIdOverride} not found in course ${exec.courseId}`,
        {
          code: 'MOODLE_WS_SECTION_NOT_FOUND',
          details: { course_id: exec.courseId, section_id: exec.sectionIdOverride },
        },
      );
    }
    await setSectionVisibility(ctx, target.id, exec.courseId, plan.section.visible);
    return {
      section: sectionDescriptor(target, plan.section.idnumber),
      status: 'updated',
    };
  }

  // 2. Look up existing section by any of the planned module idnumbers.
  // Moodle sections do not expose their own `idnumber` in the core WS
  // response, so we identify "our" section indirectly: the section that
  // already contains at least one module that belongs to this lesson.
  const plannedModuleIdnumbers = new Set(
    plan.operations
      .filter((o) => o.kind !== 'upload_asset')
      .map((o) => o.idnumber),
  );
  const existing = contents.find((s) =>
    s.modules.some(
      (m) => m.idnumber !== undefined && plannedModuleIdnumbers.has(m.idnumber),
    ),
  );
  if (existing) {
    await setSectionVisibility(ctx, existing.id, exec.courseId, plan.section.visible);
    return {
      section: sectionDescriptor(existing, plan.section.idnumber),
      status: 'updated',
    };
  }

  // 3. Section does not exist — try to create a new one via
  // `local_sernobre_mcp_create_section` (idempotent by name). If the
  // call fails, fall back to the preferred / general section with a
  // warning so publish still completes.
  try {
    const created = (await ctx.client.call(
      'local_sernobre_mcp_create_section',
      {
        courseid: exec.courseId,
        name: plan.section.name,
        position: 0, // append at end
        visible: plan.section.visible ? 1 : 0,
      },
    )) as { action: string; sectionid: number; sectionnum: number } | undefined;

    if (created?.sectionid) {
      return {
        section: {
          id: created.sectionid,
          name: plan.section.name,
          url: '',
          idnumber: plan.section.idnumber,
          sectionnum: created.sectionnum ?? 0,
        },
        status: created.action === 'exists' ? 'updated' : 'created',
      };
    }
  } catch (e) {
    warnings.push(
      `Could not auto-create section '${plan.section.name}': ${(e as Error).message}. ` +
        `Falling back to General section.`,
    );
  }

  // 4. Fallback: use preferred_section_id or section 0 (course General).
  const fallback =
    (plan.section.preferred_section_id !== null
      ? contents.find((s) => s.id === plan.section.preferred_section_id)
      : undefined) ?? contents[0];
  if (!fallback) {
    throw new MoodleWsError(
      `Course ${exec.courseId} has no sections — cannot place the lesson`,
      {
        code: 'MOODLE_WS_NO_SECTIONS',
        details: { course_id: exec.courseId },
      },
    );
  }
  warnings.push(
    `Section '${plan.section.name}' (idnumber ${plan.section.idnumber}) did not exist and auto-create failed; ` +
      `publishing into '${fallback.name}' (section ${fallback.section ?? '?'}) as fallback.`,
  );
  await setSectionVisibility(ctx, fallback.id, exec.courseId, plan.section.visible);
  return {
    section: sectionDescriptor(fallback, plan.section.idnumber),
    status: 'created',
  };
}

export async function setSectionVisibility(
  ctx: ToolContext,
  sectionId: number,
  courseId: number,
  visible: boolean,
): Promise<void> {
  try {
    await ctx.client.call('local_sernobre_mcp_update_section', {
      courseid: courseId,
      sectionid: sectionId,
      visible: visible ? 1 : 0,
    });
  } catch (e) {
    ctx.logger.warn('update_section.failed', {
      section_id: sectionId,
      course_id: courseId,
      error: (e as Error).message,
    });
    // Non-fatal — sections may already be in the desired state. The
    // publish flow carries on.
  }
}

function sectionDescriptor(s: Section, plannedIdnumber: string) {
  return {
    id: s.id,
    name: s.name,
    url: '',
    idnumber: plannedIdnumber,
    sectionnum: s.section ?? 0,
  };
}
