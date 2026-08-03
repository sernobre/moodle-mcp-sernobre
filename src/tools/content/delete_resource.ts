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
    idnumber: z
      .string()
      .min(1)
      .describe(
        'idnumber of the Moodle module to delete. Use get_course_context to find idnumbers of MCP-managed resources (prefixed with mcp:).',
      ),
    force: z
      .boolean()
      .default(false)
      .describe('If true, bypass the mcp: prefix safety check and delete any idnumber.'),
  })
  .strict();

export type DeleteResourceInput = z.infer<typeof InputSchema>;

/**
 * Delete a course module identified by its idnumber.
 *
 * Safety guard: only idnumbers starting with `mcp:` can be deleted by default
 * to prevent accidental removal of instructor-created resources. Pass
 * `force: true` to override for non-MCP idnumbers.
 *
 * Idempotent: returns `{ action: 'noop' }` if the idnumber doesn't exist.
 */
export function buildDeleteResourceTool(): ToolDefinition<DeleteResourceInput> {
  return {
    name: 'delete_resource',
    description:
      'Delete a Moodle course module by idnumber. By default only deletes MCP-managed idnumbers (mcp: prefix). Use force=true to delete any idnumber. Returns noop if the module does not exist.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const deleteResourceTool = buildDeleteResourceTool();

async function execute(args: DeleteResourceInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    if (!args.force && !args.idnumber.startsWith('mcp:')) {
      throw new Error(
        `Refusing to delete non-MCP idnumber '${args.idnumber}' without force=true. ` +
          'Only MCP-managed resources (mcp: prefix) can be auto-deleted for safety.',
      );
    }

    const result = (await ctx.client.call('local_sernobre_mcp_delete_module_by_idnumber', {
      courseid: args.course_id,
      idnumber: args.idnumber,
    })) as { action: 'deleted' | 'noop'; cmid: number | null };

    return toJsonResponse({
      action: result.action,
      cmid: result.cmid,
      idnumber: args.idnumber,
      course_id: args.course_id,
    });
  } catch (e) {
    ctx.logger.warn('delete_resource.failed', {
      course_id: args.course_id,
      idnumber: args.idnumber,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
