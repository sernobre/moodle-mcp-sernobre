import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive(),
    name: z.string().min(1).max(255).optional(),
    summary: z.string().optional(),
    visible: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.summary !== undefined || v.visible !== undefined,
    { message: 'At least one of name/summary/visible must be provided' },
  );

export type UpdateSectionInput = z.infer<typeof InputSchema>;

/**
 * Update one of more attributes of an existing section by `section_id`.
 * Only the fields that are set in the input are forwarded to Moodle,
 * so this facade is safe to call for partial edits (e.g. only rename).
 */
export function buildUpdateSectionTool(): ToolDefinition<UpdateSectionInput> {
  return {
    name: 'update_section',
    description:
      'Update a course section (name/summary/visible) identified by section_id. At least one field is required. Visibility propagates to all modules inside the section.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const updateSectionTool = buildUpdateSectionTool();

async function execute(args: UpdateSectionInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const update: Record<string, unknown> = {
      courseid: args.course_id,
      sectionid: args.section_id,
    };
    if (args.name !== undefined) update.name = args.name;
    if (args.summary !== undefined) {
      update.summary = args.summary;
      update.summaryformat = 1; // FORMAT_HTML
    }
    if (args.visible !== undefined) update.visible = args.visible ? 1 : 0;

    await ctx.client.call('local_sernobre_mcp_update_section', update);

    return toJsonResponse({
      section_id: args.section_id,
      updated_fields: Object.keys(update).filter((k) => k !== 'courseid' && k !== 'sectionid'),
    });
  } catch (e) {
    ctx.logger.warn('update_section.failed', {
      course_id: args.course_id,
      section_id: args.section_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
