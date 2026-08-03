import { z } from 'zod';
import { renderMarkdown } from '../../utils/markdown-to-html.js';
import { toErrorResponse, toJsonResponse, type ToolContext, type ToolDefinition, type ToolResponse } from '../types.js';

const BaseSchema = z.object({
  course_id: z.number().int().positive(), section_num: z.number().int().min(0).default(0),
  idnumber: z.string().min(1).max(255), name: z.string().min(1).max(255),
  intro: z.string().default(''), visible: z.boolean().default(true),
});
export const ActivityInputSchema = z.discriminatedUnion('type', [
  BaseSchema.extend({ type: z.literal('page'), content: z.string().default('') }),
  BaseSchema.extend({ type: z.literal('url'), external_url: z.string().url(), display: z.number().int().min(0).max(5).default(0) }),
  BaseSchema.extend({ type: z.literal('assign'), description: z.string().default(''), due_date: z.number().int().min(0).default(0), submissions_from: z.number().int().min(0).default(0), cutoff_date: z.number().int().min(0).default(0), grade: z.number().int().min(-1000).max(1000).default(100) }),
  BaseSchema.extend({ type: z.literal('forum'), forum_type: z.string().min(1).default('general') }),
]);
export type ActivityInput = z.infer<typeof ActivityInputSchema>;
export function buildActivityTool(name: 'create_activity' | 'update_activity'): ToolDefinition<ActivityInput> { return { name, description: 'Create or update a Moodle activity (page, URL, assignment or forum), keyed by idnumber so repeated calls do not duplicate it.', inputSchema: ActivityInputSchema, handler: (args, ctx) => executeActivity(args, ctx, name) }; }
export const createActivityTool = buildActivityTool('create_activity');
export const updateActivityTool = buildActivityTool('update_activity');
async function executeActivity(args: ActivityInput, ctx: ToolContext, toolName: string): Promise<ToolResponse> {
  try {
    const common = { courseid: args.course_id, sectionnum: args.section_num, idnumber: args.idnumber, name: args.name, intro: renderMarkdown(args.intro), visible: args.visible ? 1 : 0 };
    let fn: string; let params: Record<string, unknown>;
    switch (args.type) {
      case 'page': fn = 'local_sernobre_mcp_upsert_page'; params = { ...common, content: renderMarkdown(args.content) }; break;
      case 'url': fn = 'local_sernobre_mcp_upsert_url'; params = { ...common, externalurl: args.external_url, display: args.display }; break;
      case 'assign': fn = 'local_sernobre_mcp_upsert_assignment'; params = { ...common, intro: renderMarkdown(args.description), duedate: args.due_date, allowsubmissionsfromdate: args.submissions_from, cutoffdate: args.cutoff_date, grade: args.grade }; break;
      case 'forum': fn = 'local_sernobre_mcp_upsert_forum'; params = { ...common, type: args.forum_type }; break;
    }
    const result = await ctx.client.call(fn, params) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };
    return toJsonResponse({ type: args.type, ...result, idnumber: args.idnumber });
  } catch (e) { ctx.logger.warn(`${toolName}.failed`, { course_id: args.course_id, idnumber: args.idnumber, error: (e as Error).message }); return toErrorResponse(e); }
}
