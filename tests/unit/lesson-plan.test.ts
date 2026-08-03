import { describe, it, expect } from 'vitest';
import {
  LessonPlanSchema,
  LANGUAGES,
  MODALITIES,
  STUDENT_PROFILES,
  type LessonPlanInput,
} from '../../src/schemas/lesson-plan.js';

function validLesson(overrides: Partial<LessonPlanInput> = {}): LessonPlanInput {
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
    observable_objectives: ['define_artificial_intelligence'],
    components: [
      { id: 'opening', type: 'text', minutes: 10 },
      { id: 'closing', type: 'text', minutes: 5 },
    ],
    moodle: { course_id: 42 },
    ...overrides,
  };
}

describe('LessonPlanSchema — happy paths', () => {
  it('accepts a minimal valid lesson', () => {
    const parsed = LessonPlanSchema.parse(validLesson());
    expect(parsed.id).toBe('ai-fundamentals-2026-u1-c1');
    expect(parsed.enabled_competencies).toEqual([]);
    expect(parsed.generated_assets).toEqual([]);
  });

  it('accepts a full lesson with assets and component references', () => {
    const parsed = LessonPlanSchema.parse(
      validLesson({
        generated_assets: [
          { id: 'img-1', type: 'image', path: './assets/img-1.png', author: 'gemini' },
          { id: 'aud-1', type: 'audio_dialog', path: './assets/aud-1.mp3' },
        ],
        components: [
          { id: 'opening', type: 'text', minutes: 10 },
          { id: 'trigger-1', type: 'image', minutes: 5, asset: 'img-1' },
          { id: 'input-1', type: 'dialogue', minutes: 15, asset: 'aud-1' },
          { id: 'closing', type: 'text', minutes: 5 },
        ],
        vocabulary: [{ en: 'artificial intelligence', notes: 'machines mimicking human cognition' }],
        enabled_competencies: ['comp-23', 'comp-24'],
      }),
    );
    expect(parsed.generated_assets).toHaveLength(2);
    expect(parsed.components[1]!.asset).toBe('img-1');
  });

  it('accepts all languages', () => {
    for (const language of LANGUAGES) {
      expect(() => LessonPlanSchema.parse(validLesson({ language }))).not.toThrow();
    }
  });

  it('accepts all modalities and profiles', () => {
    for (const modality of MODALITIES) {
      expect(() => LessonPlanSchema.parse(validLesson({ modality }))).not.toThrow();
    }
    for (const student_profile of STUDENT_PROFILES) {
      expect(() =>
        LessonPlanSchema.parse(validLesson({ student_profile })),
      ).not.toThrow();
    }
  });

  it('accepts moodle.preferred_section_id as null', () => {
    const parsed = LessonPlanSchema.parse(
      validLesson({ moodle: { course_id: 42, preferred_section_id: null } }),
    );
    expect(parsed.moodle.preferred_section_id).toBeNull();
  });
});

describe('LessonPlanSchema — rejections', () => {
  it('rejects missing id', () => {
    const bad = validLesson();
    // @ts-expect-error -- deliberate
    delete bad.id;
    expect(() => LessonPlanSchema.parse(bad)).toThrow();
  });

  it('rejects type other than "lesson"', () => {
    expect(() =>
      LessonPlanSchema.parse(validLesson({ type: 'exam' as never })),
    ).toThrow();
  });

  it('rejects unknown language', () => {
    expect(() =>
      LessonPlanSchema.parse(validLesson({ language: 'spanish' as never })),
    ).toThrow();
  });

  it('rejects empty components', () => {
    expect(() => LessonPlanSchema.parse(validLesson({ components: [] }))).toThrow();
  });

  it('rejects empty observable_objectives', () => {
    expect(() =>
      LessonPlanSchema.parse(validLesson({ observable_objectives: [] })),
    ).toThrow();
  });

  it('rejects unknown top-level key (strict)', () => {
    expect(() =>
      LessonPlanSchema.parse({ ...validLesson(), foo: 'bar' }),
    ).toThrow();
  });

  it('rejects non-positive duration_min', () => {
    expect(() =>
      LessonPlanSchema.parse(validLesson({ duration_min: 0 })),
    ).toThrow();
  });

  it('rejects non-positive course_id', () => {
    expect(() =>
      LessonPlanSchema.parse(
        validLesson({ moodle: { course_id: 0 } }),
      ),
    ).toThrow();
  });
});

describe('LessonPlanSchema — cross-field rules', () => {
  it('rejects duplicate asset ids', () => {
    expect(() =>
      LessonPlanSchema.parse(
        validLesson({
          generated_assets: [
            { id: 'x', type: 'image', path: 'a.png' },
            { id: 'x', type: 'image', path: 'b.png' },
          ],
        }),
      ),
    ).toThrow(/Duplicate asset id/);
  });

  it('rejects duplicate component ids', () => {
    expect(() =>
      LessonPlanSchema.parse(
        validLesson({
          components: [
            { id: 'dup', type: 'text', minutes: 5 },
            { id: 'dup', type: 'text', minutes: 5 },
          ],
        }),
      ),
    ).toThrow(/Duplicate component id/);
  });

  it('rejects component referencing missing asset', () => {
    expect(() =>
      LessonPlanSchema.parse(
        validLesson({
          generated_assets: [{ id: 'exists', type: 'image', path: 'x.png' }],
          components: [
            { id: 'c1', type: 'image', minutes: 5, asset: 'ghost' },
          ],
        }),
      ),
    ).toThrow(/missing asset/);
  });

  it('accepts component with asset when asset exists', () => {
    expect(() =>
      LessonPlanSchema.parse(
        validLesson({
          generated_assets: [{ id: 'a1', type: 'image', path: 'x.png' }],
          components: [
            { id: 'c1', type: 'image', minutes: 5, asset: 'a1' },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
