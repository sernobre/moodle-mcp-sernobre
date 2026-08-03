import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { buildIdnumber } from '../../utils/idempotency.js';
import { CourseContentsResponseSchema } from '../../schemas/moodle-responses.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_num: z.number().int().min(0).default(0).describe(
      'Section NUMBER (0 = General, 1..N = topics). Will be resolved to section ID by the plugin.',
    ),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, { message: 'slug must be lowercase kebab-case alnum' })
      .describe('Stable key used to build the quiz idnumber'),
    name: z.string().min(1).max(254),
    intro: z.string().default(''),
    timeopen: z.number().int().min(0).default(0),
    timeclose: z.number().int().min(0).default(0),
    timelimit_seconds: z.number().int().min(0).default(0),
    attempts: z.number().int().min(0).max(10).default(0),
    grademethod: z
      .enum(['highest', 'average', 'first', 'last'])
      .default('highest'),
    grade: z.number().min(0).max(1000).default(10),
    visible: z.boolean().default(false),
  })
  .strict();

export type ConfigureQuizInput = z.infer<typeof InputSchema>;

const GRADEMETHOD_MAP: Record<ConfigureQuizInput['grademethod'], number> = {
  highest: 1,
  average: 2,
  first: 3,
  last: 4,
};

/**
 * Create or update a mod_quiz shell via the companion plugin. Idempotent
 * by (course_id, slug) → idnumber `mcp:quiz:<sha1>`. Does NOT add
 * questions — use `import_gift` for that. Use `publish_exam_lesson`
 * for a high-level one-shot that combines both.
 */
export function buildConfigureQuizTool(): ToolDefinition<ConfigureQuizInput> {
  return {
    name: 'configure_quiz',
    description:
      'Create or update a quiz shell (no questions). Idempotent by slug. Default: hidden, unlimited attempts, grade=10, method=highest. The plugin resolves section_num (section number) to section ID internally. Combine with import_gift to populate questions, or use publish_exam_lesson for both in one call.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const configureQuizTool = buildConfigureQuizTool();

async function execute(args: ConfigureQuizInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const idnumber = buildIdnumber('quiz', `${args.course_id}-${args.slug}`);
    const result = (await ctx.client.call('local_sernobre_mcp_upsert_quiz', {
      courseid: args.course_id,
      sectionnum: args.section_num,
      idnumber,
      name: args.name,
      intro: args.intro,
      timeopen: args.timeopen,
      timeclose: args.timeclose,
      timelimit: args.timelimit_seconds,
      attempts: args.attempts,
      grademethod: GRADEMETHOD_MAP[args.grademethod],
      grade: args.grade,
      visible: args.visible ? 1 : 0,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    return toJsonResponse({
      action: result.action,
      cmid: result.cmid,
      quiz_id: result.instanceid,
      url: result.url,
      idnumber,
    });
  } catch (e) {
    ctx.logger.warn('configure_quiz.failed', {
      course_id: args.course_id,
      slug: args.slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
