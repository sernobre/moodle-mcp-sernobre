import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';

const InputSchema = z
  .object({
    section_id: z.number().int().positive(),
    course_id: z.number().int().positive(),
    resource_ids: z.array(z.number().int().positive()).optional(),
  })
  .strict();

export type ConfirmPreviewInput = z.infer<typeof InputSchema>;

/**
 * Make a previously hidden section — and its modules by default —
 * visible to students. Second step of the preview workflow (after
 * `publish_preview`).
 *
 * Uses `local_sernobre_mcp_update_section`, which propagates the new
 * visibility to every module inside the section in a single WS call.
 * `resource_ids` is accepted for API compatibility but in v0.1.1 is
 * ignored — section-level visibility already governs all its modules.
 */
export const confirmPreviewTool: ToolDefinition<ConfirmPreviewInput> = {
  name: 'confirm_preview',
  description:
    'Make a previewed section visible to students. Propagates visibility to all modules inside the section. Idempotent.',
  inputSchema: InputSchema,
  async handler(args, ctx) {
    try {
      await ctx.client.call('local_sernobre_mcp_update_section', {
        courseid: args.course_id,
        sectionid: args.section_id,
        visible: 1,
      });

      return toJsonResponse({
        section: { id: args.section_id, now_visible: true },
        resources_released: args.resource_ids?.length ?? 0,
        warnings:
          args.resource_ids !== undefined
            ? [
                'resource_ids is ignored in v0.1: visibility is applied at section level and propagates to all modules inside.',
              ]
            : [],
      });
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};
