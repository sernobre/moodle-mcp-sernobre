import { z } from 'zod';
import { buildIdnumber } from '../../utils/idempotency.js';
import { toErrorResponse, toJsonResponse, type ToolContext, type ToolDefinition, type ToolResponse } from '../types.js';

const Schema = z.object({ course_id: z.number().int().positive(), section_num: z.number().int().min(0).default(0), slug: z.string().min(1).regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(254), intro: z.string().default(''), timeopen: z.number().int().min(0).default(0), timeclose: z.number().int().min(0).default(0), timelimit_seconds: z.number().int().min(0).default(0), attempts: z.number().int().min(0).max(10).default(0), grademethod: z.enum(['highest', 'average', 'first', 'last']).default('highest'), grade: z.number().min(0).max(1000).default(10), visible: z.boolean().default(true) }).strict();
type QuizInput = z.infer<typeof Schema>;
const gradeMethods = { highest: 1, average: 2, first: 3, last: 4 } as const;
export function buildQuizCrudTool(name: 'create_quiz' | 'update_quiz'): ToolDefinition<QuizInput> { return { name, description: 'Create or update a Moodle quiz shell, keyed by course and slug. Questions are managed separately with import_gift.', inputSchema: Schema, handler: (args, ctx) => execute(args, ctx, name) }; }
export const createQuizTool = buildQuizCrudTool('create_quiz');
export const updateQuizTool = buildQuizCrudTool('update_quiz');
async function execute(args: QuizInput, ctx: ToolContext, toolName: string): Promise<ToolResponse> {
  try {
    const result = await ctx.client.call('local_sernobre_mcp_upsert_quiz', { courseid: args.course_id, sectionnum: args.section_num, idnumber: buildIdnumber('quiz', `${args.course_id}-${args.slug}`), name: args.name, intro: args.intro, timeopen: args.timeopen, timeclose: args.timeclose, timelimit: args.timelimit_seconds, attempts: args.attempts, grademethod: gradeMethods[args.grademethod], grade: args.grade, visible: args.visible ? 1 : 0 }) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };
    return toJsonResponse({ ...result, quiz_id: result.instanceid, slug: args.slug });
  } catch (e) { ctx.logger.warn(`${toolName}.failed`, { course_id: args.course_id, slug: args.slug, error: (e as Error).message }); return toErrorResponse(e); }
}
