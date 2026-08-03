import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { buildIdnumber } from '../../utils/idempotency.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, { message: 'slug must be lowercase kebab-case alnum' })
      .describe('Slug that identifies the quiz (same used in configure_quiz / publish_exam_lesson).'),
  })
  .strict();

export type GetQuizQuestionsInput = z.infer<typeof InputSchema>;

const QTYPE_NAMES: Record<number, string> = {
  0: 'missingtype',
  1: 'multichoice',
  2: 'truefalse',
  3: 'shortanswer',
  4: 'numerical',
  5: 'matching',
  6: 'description',
  7: 'essay',
  8: 'random',
  9: 'calculated',
};

/**
 * List all questions attached to a quiz identified by its slug.
 *
 * Returns each question's id, name, type, and slot number. Useful for
 * verifying GIFT imports or debugging quiz structure.
 */
export function buildGetQuizQuestionsTool(): ToolDefinition<GetQuizQuestionsInput> {
  return {
    name: 'get_quiz_questions',
    description:
      'List all questions attached to a quiz (identified by its slug). Read-only. Returns question id, name, type, and slot number for each question.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const getQuizQuestionsTool = buildGetQuizQuestionsTool();

async function execute(args: GetQuizQuestionsInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const quizIdnumber = buildIdnumber('quiz', `${args.course_id}-${args.slug}`);

    const result = (await ctx.client.call('local_sernobre_mcp_get_quiz_questions', {
      courseid: args.course_id,
      idnumber: quizIdnumber,
    })) as {
      quiz_id: number;
      cmid: number;
      question_count: number;
      questions: Array<{ id: number; name: string; qtype: number; slot: number }>;
    };

    const questions = result.questions.map((q) => ({
      id: q.id,
      name: q.name,
      qtype: QTYPE_NAMES[q.qtype] ?? `qtype_${q.qtype}`,
      qtype_id: q.qtype,
      slot: q.slot,
    }));

    return toJsonResponse({
      quiz_id: result.quiz_id,
      cmid: result.cmid,
      question_count: result.question_count,
      questions,
    });
  } catch (e) {
    ctx.logger.warn('get_quiz_questions.failed', {
      course_id: args.course_id,
      slug: args.slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
