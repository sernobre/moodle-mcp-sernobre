import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { MoodleWsError } from '../../client/errors.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    summary: z.string().default(''),
    position: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Position in the course section list; 0 appends at the end.'),
    visible: z.boolean().default(true),
  })
  .strict();

export type CreateSectionInput = z.infer<typeof InputSchema>;

interface WsCreateSectionItem {
  action: 'created' | 'exists';
  sectionid: number;
  sectionnum: number;
}

/**
 * Create a new course section via `local_sernobre_mcp_create_section`.
 * The plugin creates the section with name/summary/visibility in a single
 * call and is idempotent by name (an existing section with the same name
 * is returned instead of duplicated).
 */
export function buildCreateSectionTool(): ToolDefinition<CreateSectionInput> {
  return {
    name: 'create_section',
    description:
      'Create a new section in a course with a given name, summary, position and initial visibility. Idempotent by name: reusing an existing section name returns that section instead of creating a duplicate.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const createSectionTool = buildCreateSectionTool();

async function execute(args: CreateSectionInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const info = (await ctx.client.call('local_sernobre_mcp_create_section', {
      courseid: args.course_id,
      name: args.name,
      summary: args.summary,
      summaryformat: 1, // FORMAT_HTML
      position: args.position,
      visible: args.visible ? 1 : 0,
    })) as WsCreateSectionItem | undefined;

    if (!info?.sectionid) {
      throw new MoodleWsError(
        `local_sernobre_mcp_create_section returned no section for course ${args.course_id}`,
        {
          code: 'MOODLE_WS_PLUGIN_ERROR',
          details: { course_id: args.course_id, response: info },
        },
      );
    }

    return toJsonResponse({
      section_id: info.sectionid,
      sectionnum: info.sectionnum,
      name: args.name,
      visible: args.visible,
      action: info.action,
    });
  } catch (e) {
    ctx.logger.warn('create_section.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
