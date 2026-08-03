import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

/**
 * Shared shape + implementation for `hide_section` and `release_section`.
 * Keeping them as two distinct tool names (rather than a generic "toggle")
 * makes intent explicit in agent transcripts — "hide section 3" vs
 * "release section 3" — which matters in a classroom workflow where the
 * distinction has student-facing consequences.
 */

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive(),
  })
  .strict();

export type SectionVisibilityInput = z.infer<typeof InputSchema>;

async function setSectionVisible(
  ctx: ToolContext,
  args: SectionVisibilityInput,
  visible: boolean,
  logName: string,
): Promise<ToolResponse> {
  try {
    await ctx.client.call('local_sernobre_mcp_update_section', {
      courseid: args.course_id,
      sectionid: args.section_id,
      visible: visible ? 1 : 0,
    });
    return toJsonResponse({
      section_id: args.section_id,
      visible,
    });
  } catch (e) {
    ctx.logger.warn(`${logName}.failed`, {
      course_id: args.course_id,
      section_id: args.section_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}

export function buildHideSectionTool(): ToolDefinition<SectionVisibilityInput> {
  return {
    name: 'hide_section',
    description:
      'Hide a course section (and its modules) from students. Visibility propagates to all modules inside the section.',
    inputSchema: InputSchema,
    handler: (args, ctx) => setSectionVisible(ctx, args, false, 'hide_section'),
  };
}

export function buildReleaseSectionTool(): ToolDefinition<SectionVisibilityInput> {
  return {
    name: 'release_section',
    description:
      'Make a course section visible to students (reverse of hide_section).',
    inputSchema: InputSchema,
    handler: (args, ctx) => setSectionVisible(ctx, args, true, 'release_section'),
  };
}

export const hideSectionTool = buildHideSectionTool();
export const releaseSectionTool = buildReleaseSectionTool();
