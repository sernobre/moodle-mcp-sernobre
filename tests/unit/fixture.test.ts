import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { LessonPlanSchema } from '../../src/schemas/lesson-plan.js';
import { extractComponentBodies } from '../../src/tools/content/publish/lesson-bodies.js';
import { planLesson } from '../../src/adapters/lesson-to-moodle.js';

const fixturePath = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'lesson-example.md',
);

describe('fixture lesson-example.md', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = matter(raw);

  it('frontmatter validates against LessonPlanSchema', () => {
    const lesson = LessonPlanSchema.parse(parsed.data);
    expect(lesson.id).toBe('ai-fundamentals-2026-u1-c1');
    expect(lesson.components).toHaveLength(8);
    expect(lesson.generated_assets).toHaveLength(2);
  });

  it('body has an anchor for every component', () => {
    const lesson = LessonPlanSchema.parse(parsed.data);
    const bodies = extractComponentBodies(parsed.content);
    for (const c of lesson.components) {
      expect(bodies).toHaveProperty(c.id);
      expect(bodies[c.id]!.length).toBeGreaterThan(0);
    }
  });

  it('plan emits exactly 10 operations (2 assets used + 8 components)', () => {
    const lesson = LessonPlanSchema.parse(parsed.data);
    const bodies = extractComponentBodies(parsed.content);
    const plan = planLesson({ lesson, visible: false, componentContent: bodies });
    const uploads = plan.operations.filter((o) => o.kind === 'upload_asset');
    const upserts = plan.operations.filter((o) => o.kind !== 'upload_asset');
    expect(uploads).toHaveLength(2);
    expect(upserts).toHaveLength(8);
  });
});
