import {
  CourseContentsResponseSchema,
  type Section,
  type Module,
} from '../../../schemas/moodle-responses.js';
import type { Component } from '../../../schemas/lesson-plan.js';
import type { Plan } from '../../../adapters/lesson-to-moodle.js';
import type { ToolContext } from '../../types.js';
import type { ExecuteContext, ExecuteResult, ResourceResult } from './types.js';
import { ensureSection } from './ensure-section.js';
import { executeUploadAsset } from './asset-upload.js';
import {
  upsertPageOp,
  upsertUrlOp,
  upsertAssignmentOp,
} from './upsert-ops.js';

/**
 * Execute a {@link Plan} against a real Moodle course: locate/create the
 * section, upload referenced assets, then upsert each component module by its
 * stable `idnumber`.
 */
export async function executePlan(
  ctx: ToolContext,
  plan: Plan,
  exec: ExecuteContext,
  componentsById: Map<string, Component>,
): Promise<ExecuteResult> {
  const warnings: string[] = [];

  const contentsRaw = await ctx.client.call('core_course_get_contents', {
    courseid: exec.courseId,
  });
  const contents = CourseContentsResponseSchema.parse(contentsRaw);

  const { section, status } = await ensureSection(ctx, {
    contents,
    plan,
    exec,
    warnings,
  });

  const uploadOps = plan.operations.filter(
    (o): o is Extract<Plan['operations'][number], { kind: 'upload_asset' }> =>
      o.kind === 'upload_asset',
  );
  const assetPathToUrl = new Map<string, string>();
  for (const up of uploadOps) {
    const uploaded = await executeUploadAsset(ctx, up, exec.lessonDir, exec.courseId);
    if (uploaded === null) {
      warnings.push(
        `Asset upload for '${up.asset_id}' (${up.asset_type}) failed — the page will ` +
          `render with the original markdown path '${up.asset_path}'. Check ctx logs ` +
          `for 'upload_asset.failed'.`,
      );
      continue;
    }
    assetPathToUrl.set(up.asset_path, uploaded.url);
  }

  const resources: ResourceResult[] = [];
  const moduleIndex = indexModulesByIdnumber(contents);

  for (const op of plan.operations) {
    if (op.kind === 'upload_asset') continue;

    if (op.kind === 'upsert_page') {
      const result = await upsertPageOp(ctx, op, {
        courseId: exec.courseId,
        sectionnum: section.sectionnum,
        component: componentsById.get(op.component_id),
        assetPathToUrl,
        warnings,
      });
      resources.push(result);
      continue;
    }

    if (op.kind === 'upsert_url') {
      const result = await upsertUrlOp(ctx, op, {
        courseId: exec.courseId,
        sectionnum: section.sectionnum,
      });
      resources.push(result);
      continue;
    }

    if (op.kind === 'upsert_assignment') {
      const result = await upsertAssignmentOp(ctx, op, {
        courseId: exec.courseId,
        sectionnum: section.sectionnum,
      });
      resources.push(result);
      continue;
    }

    // No other kinds should reach here — the type system already covers
    // upload_asset / upsert_page / upsert_url / upsert_assignment. This
    // arm is a defensive fallback for an unexpected op kind so we emit
    // a structured warning and mark the component missing instead of
    // crashing the whole publish.
    const unknownOp = op as { kind: string; component_id: string; idnumber: string };
    const existing = moduleIndex.get(unknownOp.idnumber);
    if (!existing) {
      warnings.push(
        `Unknown op kind '${unknownOp.kind}' for component ` +
          `'${unknownOp.component_id}' (idnumber ${unknownOp.idnumber}). Not handled by v0.5.`,
      );
      resources.push({
        component_id: unknownOp.component_id,
        moodle_id: null,
        type: moduleTypeFromOp(unknownOp.kind),
        url: null,
        idnumber: unknownOp.idnumber,
        status: 'missing',
      });
      continue;
    }
    resources.push({
      component_id: unknownOp.component_id,
      moodle_id: existing.id,
      type: existing.modname,
      url: existing.url ?? null,
      idnumber: unknownOp.idnumber,
      status: 'skipped',
    });
  }

  return {
    status,
    section,
    resources,
    warnings,
  };
}

function indexModulesByIdnumber(contents: Section[]): Map<string, Module> {
  const map = new Map<string, Module>();
  for (const s of contents) {
    for (const m of s.modules) {
      if (m.idnumber) map.set(m.idnumber, m);
    }
  }
  return map;
}

function moduleTypeFromOp(kind: string): string {
  switch (kind) {
    case 'upsert_page':
      return 'page';
    case 'upsert_assignment':
      return 'assign';
    case 'upsert_url':
      return 'url';
    default:
      return 'module';
  }
}
