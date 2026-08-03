import type { Component } from '../../../schemas/lesson-plan.js';
import type { Plan } from '../../../adapters/lesson-to-moodle.js';
import type { ToolContext } from '../../types.js';
import type { ResourceResult } from './types.js';
import { renderMarkdown } from '../../../utils/markdown-to-html.js';
import { resolveStyle, wrapWithStyle } from '../../../utils/style-presets.js';
import { rewriteAssetRefs } from './asset-upload.js';

function describeMoodleError(e: unknown): string {
  const error = e as Error & { code?: unknown; details?: { errorcode?: unknown; debuginfo?: unknown } };
  const parts = [error.message];
  if (typeof error.code === 'string' && error.code !== '') parts.push(`code=${error.code}`);
  if (typeof error.details?.errorcode === 'string' && error.details.errorcode !== '') {
    parts.push(`errorcode=${error.details.errorcode}`);
  }
  if (typeof error.details?.debuginfo === 'string' && error.details.debuginfo !== '') {
    parts.push(`debuginfo=${error.details.debuginfo}`);
  }
  return parts.filter(Boolean).join(' | ');
}

/**
 * One `upsert_*` call per lesson component kind. Each op talks to the
 * companion plugin's idempotent endpoint (upsert by `idnumber`) and maps a
 * success/failure into a {@link ResourceResult}.
 */

interface UpsertPageScope {
  courseId: number;
  sectionnum: number;
  component: Component | undefined;
  assetPathToUrl: Map<string, string>;
  warnings: string[];
}

export async function upsertPageOp(
  ctx: ToolContext,
  op: Plan['operations'][number] & { kind: 'upsert_page' },
  scope: UpsertPageScope,
): Promise<ResourceResult> {
  const markdown = rewriteAssetRefs(op.content_markdown, scope.assetPathToUrl);
  const rawHtml = markdown.trim() === '' ? '' : renderMarkdown(markdown);
  const style = resolveStyle({
    type: scope.component?.type ?? 'default',
    ...(scope.component?.style !== undefined ? { style: scope.component.style } : {}),
    ...(scope.component?.custom_style !== undefined
      ? { customStyle: scope.component.custom_style }
      : {}),
  });
  const styledHtml = rawHtml === '' ? '' : wrapWithStyle(rawHtml, style);

  if (styledHtml.trim() === '') {
    scope.warnings.push(
      `Component '${op.component_id}' (${op.idnumber}) published with EMPTY content — ` +
        `no \`{#id}\` anchor or empty body found in the lesson markdown for this component.`,
    );
  }

  try {
    const result = (await ctx.client.call('local_sernobre_mcp_upsert_page', {
      courseid: scope.courseId,
      sectionnum: scope.sectionnum,
      idnumber: op.idnumber,
      name: op.name,
      intro: '',
      content: styledHtml,
      visible: op.visible ? 1 : 0,
    })) as {
      action: 'created' | 'updated';
      cmid: number;
      instanceid: number;
      url: string;
      contentlen?: number;
    };

    return {
      component_id: op.component_id,
      moodle_id: result.cmid,
      type: 'page',
      url: result.url,
      idnumber: op.idnumber,
      status: result.action,
      ...(result.contentlen !== undefined ? { contentlen: result.contentlen } : {}),
    };
  } catch (e) {
    ctx.logger.warn('upsert_page.failed', {
      idnumber: op.idnumber,
      error: describeMoodleError(e),
    });
    return {
      component_id: op.component_id,
      moodle_id: null,
      type: 'page',
      url: null,
      idnumber: op.idnumber,
      status: 'failed',
      error: describeMoodleError(e),
    };
  }
}

interface UpsertUrlScope {
  courseId: number;
  sectionnum: number;
}

export async function upsertUrlOp(
  ctx: ToolContext,
  op: Plan['operations'][number] & { kind: 'upsert_url' },
  scope: UpsertUrlScope,
): Promise<ResourceResult> {
  try {
    const result = (await ctx.client.call('local_sernobre_mcp_upsert_url', {
      courseid: scope.courseId,
      sectionnum: scope.sectionnum,
      idnumber: op.idnumber,
      name: op.name,
      externalurl: op.externalurl,
      intro: '',
      display: 0,
      visible: op.visible ? 1 : 0,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    return {
      component_id: op.component_id,
      moodle_id: result.cmid,
      type: 'url',
      url: result.url,
      idnumber: op.idnumber,
      status: result.action,
    };
  } catch (e) {
    ctx.logger.warn('upsert_url.failed', {
      idnumber: op.idnumber,
      error: describeMoodleError(e),
    });
    return {
      component_id: op.component_id,
      moodle_id: null,
      type: 'url',
      url: null,
      idnumber: op.idnumber,
      status: 'failed',
      error: describeMoodleError(e),
    };
  }
}

export async function upsertAssignmentOp(
  ctx: ToolContext,
  op: Plan['operations'][number] & { kind: 'upsert_assignment' },
  scope: UpsertUrlScope,
): Promise<ResourceResult> {
  try {
    const introHtml =
      op.description_markdown.trim() === '' ? '' : renderMarkdown(op.description_markdown);
    const result = (await ctx.client.call('local_sernobre_mcp_upsert_assignment', {
      courseid: scope.courseId,
      sectionnum: scope.sectionnum,
      idnumber: op.idnumber,
      name: op.name,
      intro: introHtml,
      duedate: 0,
      allowsubmissionsfromdate: 0,
      cutoffdate: 0,
      grade: 100,
      visible: op.visible ? 1 : 0,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    return {
      component_id: op.component_id,
      moodle_id: result.cmid,
      type: 'assign',
      url: result.url,
      idnumber: op.idnumber,
      status: result.action,
    };
  } catch (e) {
    ctx.logger.warn('upsert_assignment.failed', {
      idnumber: op.idnumber,
      error: describeMoodleError(e),
    });
    return {
      component_id: op.component_id,
      moodle_id: null,
      type: 'assign',
      url: null,
      idnumber: op.idnumber,
      status: 'failed',
      error: describeMoodleError(e),
    };
  }
}
