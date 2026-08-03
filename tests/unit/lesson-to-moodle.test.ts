import { describe, it, expect } from 'vitest';
import {
  planLesson,
  type Plan,
  type PlanUpsertPage,
  type PlanUpsertAssignment,
  type PlanUpsertUrl,
  type PlanUploadAsset,
} from '../../src/adapters/lesson-to-moodle.js';
import {
  LessonPlanSchema,
  type LessonPlanInput,
} from '../../src/schemas/lesson-plan.js';
import {
  buildIdnumber,
  buildSectionIdnumber,
} from '../../src/utils/idempotency.js';

function lesson(overrides: Partial<LessonPlanInput> = {}): LessonPlanInput {
  return {
    id: 'ai-fundamentals-2026-u1-c1',
    type: 'lesson',
    language: 'english',
    program: 'ai-fundamentals-2026',
    unit: 1,
    order: 1,
    duration_min: 90,
    modality: 'virtual',
    student_profile: 'adult',
    observable_objectives: ['o1'],
    components: [{ id: 'opening', type: 'text', minutes: 10 }],
    moodle: { course_id: 42 },
    ...overrides,
  };
}

function parse(input: LessonPlanInput) {
  return LessonPlanSchema.parse(input);
}

function plan(input: LessonPlanInput, visible = true, componentContent?: Record<string, string>): Plan {
  return planLesson({
    lesson: parse(input),
    visible,
    ...(componentContent ? { componentContent } : {}),
  });
}

describe('planLesson — section', () => {
  it('builds section with stable idnumber and default name', () => {
    const p = plan(lesson());
    expect(p.section.idnumber).toBe(buildSectionIdnumber('ai-fundamentals-2026-u1-c1'));
    expect(p.section.name).toBe('Lesson 1 — ai-fundamentals-2026 u1');
    expect(p.section.preferred_section_id).toBeNull();
    expect(p.section.visible).toBe(true);
  });

  it('propagates preferred_section_id from moodle ref', () => {
    const p = plan(lesson({ moodle: { course_id: 42, preferred_section_id: 7 } }));
    expect(p.section.preferred_section_id).toBe(7);
  });

  it('maps visible=false when publishing hidden / preview', () => {
    const p = plan(lesson(), false);
    expect(p.section.visible).toBe(false);
  });
});

describe('planLesson — asset uploads', () => {
  it('does not emit uploads for unused assets', () => {
    const p = plan(
      lesson({
        generated_assets: [
          { id: 'img-1', type: 'image', path: './a.png' },
          { id: 'unused', type: 'audio', path: './u.mp3' },
        ],
        components: [
          { id: 'comp', type: 'image', minutes: 5, asset: 'img-1' },
        ],
      }),
    );
    const uploads = p.operations.filter((o): o is PlanUploadAsset => o.kind === 'upload_asset');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.asset_id).toBe('img-1');
  });

  it('deduplicates assets referenced by multiple components', () => {
    const p = plan(
      lesson({
        generated_assets: [{ id: 'shared', type: 'image', path: './s.png' }],
        components: [
          { id: 'c1', type: 'image', minutes: 1, asset: 'shared' },
          { id: 'c2', type: 'image', minutes: 1, asset: 'shared' },
        ],
      }),
    );
    const uploads = p.operations.filter((o) => o.kind === 'upload_asset');
    expect(uploads).toHaveLength(1);
  });

  it('emits asset uploads before module upserts', () => {
    const p = plan(
      lesson({
        generated_assets: [{ id: 'img-1', type: 'image', path: './a.png' }],
        components: [
          { id: 'comp', type: 'image', minutes: 5, asset: 'img-1' },
        ],
      }),
    );
    expect(p.operations[0]!.kind).toBe('upload_asset');
    expect(p.operations[1]!.kind).toBe('upsert_page');
  });

  it('emits uploads in lesson declaration order', () => {
    const p = plan(
      lesson({
        generated_assets: [
          { id: 'a', type: 'image', path: './a.png' },
          { id: 'b', type: 'image', path: './b.png' },
          { id: 'c', type: 'image', path: './c.png' },
        ],
        components: [
          { id: 'k1', type: 'image', minutes: 1, asset: 'c' },
          { id: 'k2', type: 'image', minutes: 1, asset: 'a' },
          { id: 'k3', type: 'image', minutes: 1, asset: 'b' },
        ],
      }),
    );
    const uploads = p.operations.filter((o): o is PlanUploadAsset => o.kind === 'upload_asset');
    expect(uploads.map((u) => u.asset_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('planLesson — component mapping', () => {
  it('maps plain types to upsert_page', () => {
    const p = plan(
      lesson({
        components: [
          { id: 'opening', type: 'text', minutes: 5 },
          { id: 'd1', type: 'dialogue', minutes: 10 },
          { id: 'ex1', type: 'cloze_exercise', minutes: 5 },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages).toHaveLength(3);
    expect(pages.map((x) => x.component_id)).toEqual(['opening', 'd1', 'ex1']);
  });

  it('maps async_task to upsert_assignment', () => {
    const p = plan(
      lesson({
        components: [
          { id: 't1', type: 'async_task', minutes: 15 },
          { id: 't2', type: 'async_task', minutes: 15 },
        ],
      }),
    );
    const assignments = p.operations.filter(
      (o): o is PlanUpsertAssignment => o.kind === 'upsert_assignment',
    );
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.component_id)).toEqual(['t1', 't2']);
  });

  it('maps url type to upsert_url and reads metadata.url', () => {
    const p = plan(
      lesson({
        components: [
          {
            id: 'ext',
            type: 'url',
            metadata: { url: 'https://example.com' },
          },
        ],
      }),
    );
    const urls = p.operations.filter((o): o is PlanUpsertUrl => o.kind === 'upsert_url');
    expect(urls).toHaveLength(1);
    expect(urls[0]!.externalurl).toBe('https://example.com');
  });

  it('uses metadata.title as module name when provided', () => {
    const p = plan(
      lesson({
        components: [
          {
            id: 'raw-id',
            type: 'text',
            minutes: 5,
            metadata: { title: 'Nice Title' },
          },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.name).toBe('Nice Title');
  });

  it('falls back to component id when no metadata.title', () => {
    const p = plan(lesson());
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.name).toBe('opening');
  });

  it('produces a stable idnumber per component', () => {
    const p = plan(lesson());
    const op = p.operations[0] as PlanUpsertPage;
    expect(op.idnumber).toBe(
      buildIdnumber('module', 'ai-fundamentals-2026-u1-c1|opening'),
    );
  });

  it('carries visible flag down to every upsert', () => {
    const p = plan(
      lesson({
        components: [
          { id: 'a', type: 'text', minutes: 1 },
          { id: 'b', type: 'async_task', minutes: 1 },
          { id: 'c', type: 'url', metadata: { url: 'https://x' } },
        ],
      }),
      false,
    );
    const upserts = p.operations.filter((o) => o.kind !== 'upload_asset') as Array<
      PlanUpsertPage | PlanUpsertAssignment | PlanUpsertUrl
    >;
    for (const u of upserts) expect(u.visible).toBe(false);
  });

  it('fills content_markdown from componentContent map', () => {
    const p = plan(lesson(), true, { opening: '# Greeting\n\nCiao!' });
    const page = p.operations[0] as PlanUpsertPage;
    expect(page.content_markdown).toBe('# Greeting\n\nCiao!');
  });

  it('defaults content_markdown to empty when key is absent', () => {
    const p = plan(lesson());
    const page = p.operations[0] as PlanUpsertPage;
    expect(page.content_markdown).toBe('');
  });

  it('records asset_refs on pages that reference an asset', () => {
    const p = plan(
      lesson({
        generated_assets: [{ id: 'img-1', type: 'image', path: './a.png' }],
        components: [
          { id: 'opening', type: 'text', minutes: 5 },
          { id: 'img', type: 'image', minutes: 5, asset: 'img-1' },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.asset_refs).toEqual([]);
    expect(pages[1]!.asset_refs).toEqual(['img-1']);
  });

  it('preserves component declaration order', () => {
    const p = plan(
      lesson({
        components: [
          { id: 'a', type: 'text', minutes: 1 },
          { id: 'b', type: 'text', minutes: 1 },
          { id: 'c', type: 'text', minutes: 1 },
        ],
      }),
    );
    const ids = p.operations
      .filter((o): o is PlanUpsertPage => o.kind === 'upsert_page')
      .map((o) => o.component_id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
