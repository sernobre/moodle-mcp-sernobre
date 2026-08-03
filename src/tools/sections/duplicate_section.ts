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
    source_section_id: z
      .number()
      .int()
      .positive()
      .describe('ID of the section to duplicate (use get_course_context to find section IDs).'),
    name: z.string().min(1).max(255).describe('Name for the new section.'),
    visible: z.boolean().default(true),
  })
  .strict();

export type DuplicateSectionInput = z.infer<typeof InputSchema>;

/**
 * Duplicate all modules in a course section to a new section.
 *
 * Creates a new section with the given name, then copies each module from
 * the source section into it. Modules are shallow-copied (plugin instances
 * are duplicated with new IDs). Content files are not duplicated — the copy
 * is a reference clone.
 *
 * Idempotent: if a section with the same name already exists, returns
 * `action: "exists"` with the existing section instead of creating a duplicate.
 */
export function buildDuplicateSectionTool(): ToolDefinition<DuplicateSectionInput> {
  return {
    name: 'duplicate_section',
    description:
      'Duplicate all modules from a source section into a new section in the same course. New section is named per the `name` param. Idempotent: returns "exists" if a section with that name already exists.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const duplicateSectionTool = buildDuplicateSectionTool();

async function execute(args: DuplicateSectionInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const result = (await ctx.client.call('local_sernobre_mcp_duplicate_section', {
      courseid: args.course_id,
      source_section_id: args.source_section_id,
      name: args.name,
      visible: args.visible ? 1 : 0,
    })) as {
      action: 'created' | 'exists';
      section_id: number;
      sectionnum: number;
      duplicated_modules: number;
    };

    return toJsonResponse({
      action: result.action,
      section_id: result.section_id,
      sectionnum: result.sectionnum,
      name: args.name,
      duplicated_modules: result.duplicated_modules,
      course_id: args.course_id,
    });
  } catch (e) {
    ctx.logger.warn('duplicate_section.failed', {
      course_id: args.course_id,
      source_section_id: args.source_section_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
