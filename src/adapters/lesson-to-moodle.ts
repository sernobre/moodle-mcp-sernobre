import {
  type GeneratedAsset,
  type AssetType,
  type Component,
  type LessonPlan,
} from '../schemas/lesson-plan.js';
import {
  buildIdnumber,
  buildSectionIdnumber,
} from '../utils/idempotency.js';

/**
 * Pure mapping layer: turns a validated {@link LessonPlan} into a list of
 * Moodle-side operations *without executing any of them*. Keeping this
 * logic side-effect-free lets us unit-test mapping rules in isolation and
 * makes the tool layer (`publish_class_lesson`) a thin executor.
 */

export interface PlanInput {
  /** The validated lesson. */
  lesson: LessonPlan;
  /** Publish visible (true) or hidden / preview (false). */
  visible: boolean;
  /**
   * Optional markdown bodies keyed by `component.id`. The tool layer is
   * expected to extract these by `{#id}` anchors from the lesson markdown
   * body and pass them in. Missing keys default to an empty string.
   */
  componentContent?: Record<string, string>;
}

export interface SectionPlan {
  idnumber: string;
  name: string;
  summary: string;
  preferred_section_id: number | null;
  visible: boolean;
}

export interface PlanUploadAsset {
  kind: 'upload_asset';
  asset_id: string;
  asset_path: string;
  asset_type: AssetType;
}

export interface PlanUpsertPage {
  kind: 'upsert_page';
  idnumber: string;
  component_id: string;
  name: string;
  content_markdown: string;
  visible: boolean;
  /** Asset ids referenced by this page. The executor rewrites markdown asset paths to Moodle URLs. */
  asset_refs: string[];
}

export interface PlanUpsertAssignment {
  kind: 'upsert_assignment';
  idnumber: string;
  component_id: string;
  name: string;
  description_markdown: string;
  visible: boolean;
}

export interface PlanUpsertUrl {
  kind: 'upsert_url';
  idnumber: string;
  component_id: string;
  name: string;
  externalurl: string;
  visible: boolean;
}

export type PlanOperation =
  | PlanUploadAsset
  | PlanUpsertPage
  | PlanUpsertAssignment
  | PlanUpsertUrl;

export interface Plan {
  section: SectionPlan;
  operations: PlanOperation[];
}

type ModuleKind = 'page' | 'assignment' | 'url';

function componentKind(type: string): ModuleKind {
  if (type === 'async_task') {
    return 'assignment';
  }
  if (type === 'url') return 'url';
  return 'page';
}

function componentName(c: Component): string {
  const md = c.metadata;
  if (md && typeof md === 'object' && typeof (md as { title?: unknown }).title === 'string') {
    const title = (md as { title: string }).title.trim();
    if (title !== '') return title;
  }
  return c.id;
}

function extractExternalUrl(c: Component): string {
  const md = c.metadata;
  if (md && typeof md === 'object' && typeof (md as { url?: unknown }).url === 'string') {
    return (md as { url: string }).url;
  }
  return '';
}

function sectionName(lesson: LessonPlan): string {
  return `Lesson ${lesson.order} — ${lesson.program} u${lesson.unit}`;
}

/**
 * Compute the plan. Operation ordering reflects execution order:
 *   1. upload every asset that is referenced by at least one component
 *      (unused assets are skipped — no point uploading them to Moodle)
 *   2. one `upsert_*` per component, in the order declared in the lesson
 *
 * The `section` lives outside `operations` because it is always needed and
 * because the executor typically creates/updates it before or after the
 * module operations depending on the Moodle plugin setup available.
 */
export function planLesson(input: PlanInput): Plan {
  const { lesson, visible } = input;
  const content = input.componentContent ?? {};

  const assetMap = new Map<string, GeneratedAsset>(
    lesson.generated_assets.map((a) => [a.id, a]),
  );
  const usedAssetIds = new Set<string>();
  for (const c of lesson.components) {
    if (c.asset !== undefined) usedAssetIds.add(c.asset);
  }

  const operations: PlanOperation[] = [];

  // 1. asset uploads (in the order assets appear in the lesson)
  for (const a of lesson.generated_assets) {
    if (!usedAssetIds.has(a.id)) continue;
    operations.push({
      kind: 'upload_asset',
      asset_id: a.id,
      asset_path: a.path,
      asset_type: a.type,
    });
  }

  // 2. one upsert per component
  for (const c of lesson.components) {
    const idnumber = buildIdnumber('module', `${lesson.id}|${c.id}`);
    const name = componentName(c);
    const kind = componentKind(c.type);
    const body = content[c.id] ?? '';
    const refs = c.asset !== undefined ? [c.asset] : [];

    if (kind === 'assignment') {
      operations.push({
        kind: 'upsert_assignment',
        idnumber,
        component_id: c.id,
        name,
        description_markdown: body,
        visible,
      });
      continue;
    }
    if (kind === 'url') {
      operations.push({
        kind: 'upsert_url',
        idnumber,
        component_id: c.id,
        name,
        externalurl: extractExternalUrl(c),
        visible,
      });
      continue;
    }
    operations.push({
      kind: 'upsert_page',
      idnumber,
      component_id: c.id,
      name,
      content_markdown: body,
      visible,
      asset_refs: refs,
    });
  }

  return {
    section: {
      idnumber: buildSectionIdnumber(lesson.id),
      name: sectionName(lesson),
      summary: '',
      preferred_section_id: lesson.moodle.preferred_section_id ?? null,
      visible,
    },
    operations,
  };
}
