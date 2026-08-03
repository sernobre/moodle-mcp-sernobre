import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { buildIdnumber } from '../../utils/idempotency.js';

const FORUM_TYPES = [
  'general',
  'news',
  'peerjs',
  'social',
  'single_simple_discussion',
  'q_and_a',
  'each_person_posts_one_discussion',
  'no_replies',
] as const;

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_num: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Section number (0 = General, 1..N = topics)'),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, { message: 'slug must be lowercase kebab-case alnum' })
      .describe('Stable key used to build the forum idnumber'),
    name: z.string().min(1).max(254),
    intro: z.string().default(''),
    visible: z.boolean().default(false),
    forum_type: z
      .enum(FORUM_TYPES)
      .default('general')
      .describe('Forum type. Use "news" for announcement forums (auto-subscribed).'),
  })
  .strict();

export type CreateForumInput = z.infer<typeof InputSchema>;

/**
 * Create or update a mod_forum in a course section. Idempotent by
 * (course_id, slug) → idnumber `mcp:forum:<sha1>`.
 *
 * Useful for creating discussion forums, announcement forums (type="news"),
 * Q&A forums, etc. The forum is created via the companion plugin's
 * `local_sernobre_mcp_upsert_forum` endpoint.
 */
export function buildCreateForumTool(): ToolDefinition<CreateForumInput> {
  return {
    name: 'create_forum',
    description:
      'Create or update a forum (discussion, announcement, Q&A, etc.) in a course section. Idempotent by slug. Default: hidden forum of type "general". Requires the plugin companion.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const createForumTool = buildCreateForumTool();

async function execute(args: CreateForumInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const idnumber = buildIdnumber('forum', `${args.course_id}-${args.slug}`);
    const result = (await ctx.client.call('local_sernobre_mcp_upsert_forum', {
      courseid: args.course_id,
      sectionnum: args.section_num,
      idnumber,
      name: args.name,
      intro: args.intro,
      visible: args.visible ? 1 : 0,
      type: args.forum_type,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    return toJsonResponse({
      action: result.action,
      cmid: result.cmid,
      forum_id: result.instanceid,
      url: result.url,
      idnumber,
      forum_type: args.forum_type,
    });
  } catch (e) {
    ctx.logger.warn('create_forum.failed', {
      course_id: args.course_id,
      slug: args.slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
