import { z } from 'zod';

/**
 * Zod schema for a LessonPlan — the canonical pedagogical lesson contract
 * this MCP consumes. Mirrors CONTEXT.md §7.1.
 *
 * Strict keys: unknown top-level properties are rejected so that typos in
 * the YAML frontmatter fail fast at publish time rather than silently.
 *
 * Cross-field checks enforced via `superRefine`:
 *   - asset ids are unique
 *   - component ids are unique
 *   - every `component.asset` reference resolves to a known asset id
 */

export const LANGUAGES = ['english', 'italian', 'portuguese'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MODALITIES = ['virtual', 'in_person', 'hybrid'] as const;
export type Modality = (typeof MODALITIES)[number];

export const STUDENT_PROFILES = ['adult', 'adolescent', 'university'] as const;
export type StudentProfile = (typeof STUDENT_PROFILES)[number];

export const ASSET_TYPES = [
  'image',
  'audio',
  'audio_dialog',
  'video',
  'document',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Known component kinds. `type` is a free string so new kinds can be added
 * without a breaking schema change; this constant is exported for tooling
 * and documentation, not for validation.
 */
export const KNOWN_COMPONENT_TYPES = [
  'text',
  'image',
  'dialogue',
  'cloze_exercise',
  'multiple_choice_exercise',
  'true_false_exercise',
  'matching_exercise',
  'oral_production',
  'written_production',
  'vocabulary',
  'async_task',
  'video',
  'audio',
  'url',
] as const;

const nonEmpty = z.string().min(1);

export const VocabularyItemSchema = z
  .object({
    it: z.string().optional(),
    pt: z.string().optional(),
    en: nonEmpty,
    ipa: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();
export type VocabularyItem = z.infer<typeof VocabularyItemSchema>;

export const GeneratedAssetSchema = z
  .object({
    id: nonEmpty,
    type: z.enum(ASSET_TYPES),
    path: nonEmpty,
    author: z.string().optional(),
    license: z.string().optional(),
  })
  .strict();
export type GeneratedAsset = z.infer<typeof GeneratedAssetSchema>;

export const ComponentSchema = z
  .object({
    id: nonEmpty,
    type: nonEmpty,
    minutes: z.number().int().positive().optional(),
    asset: z.string().optional(),
    /**
     * Named style preset. See `src/utils/style-presets.ts` for the list.
     * When absent, the preset is auto-detected from `type`.
     */
    style: z.string().optional(),
    /**
     * Raw CSS (style attribute value) that overrides both the preset and
     * the auto-detected default. Use sparingly — breaks visual consistency
     * across the program if over-used.
     */
    custom_style: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type Component = z.infer<typeof ComponentSchema>;

export const MoodleRefSchema = z
  .object({
    course_id: z.number().int().positive(),
    preferred_section_id: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type MoodleRef = z.infer<typeof MoodleRefSchema>;

const LessonPlanBase = z
  .object({
    id: nonEmpty,
    type: z.literal('lesson'),
    language: z.enum(LANGUAGES),
    program: nonEmpty,
    unit: z.number().int().nonnegative(),
    order: z.number().int().nonnegative(),
    duration_min: z.number().int().positive(),
    modality: z.enum(MODALITIES),
    student_profile: z.enum(STUDENT_PROFILES),
    enabled_competencies: z.array(nonEmpty).default([]),
    prerequisite_competencies: z.array(nonEmpty).default([]),
    observable_objectives: z.array(nonEmpty).min(1),
    vocabulary: z.array(VocabularyItemSchema).default([]),
    structures: z.array(nonEmpty).default([]),
    generated_assets: z.array(GeneratedAssetSchema).default([]),
    components: z.array(ComponentSchema).min(1),
    moodle: MoodleRefSchema,
  })
  .strict();

export const LessonPlanSchema = LessonPlanBase.superRefine((data, ctx) => {
  const assetIds = new Set<string>();
  for (const a of data.generated_assets) {
    if (assetIds.has(a.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['generated_assets'],
        message: `Duplicate asset id: ${a.id}`,
      });
    }
    assetIds.add(a.id);
  }
  const compIds = new Set<string>();
  for (const c of data.components) {
    if (compIds.has(c.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components'],
        message: `Duplicate component id: ${c.id}`,
      });
    }
    compIds.add(c.id);
    if (c.asset !== undefined && !assetIds.has(c.asset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components'],
        message: `Component '${c.id}' references missing asset: '${c.asset}'`,
      });
    }
  }
});

export type LessonPlan = z.infer<typeof LessonPlanSchema>;

/**
 * Input type — what callers must supply. Has optionals for fields with
 * defaults; the parsed output (`LessonPlan`) has them as required arrays.
 */
export type LessonPlanInput = z.input<typeof LessonPlanSchema>;
