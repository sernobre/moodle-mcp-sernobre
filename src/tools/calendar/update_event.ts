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
    event_id: z.number().int().positive(),
    new_timestart: z.number().int().positive().describe('New start timestamp (Unix seconds).'),
  })
  .strict();

export type UpdateEventInput = z.infer<typeof InputSchema>;

/**
 * Reschedule a calendar event to a new day. Wraps
 * core_calendar_update_event_start_day — Moodle core does not expose a
 * full event update via WS, so v0.5 covers the most common case:
 * changing the date/time of an existing event.
 *
 * To update name/description/location, delete + re-create the event
 * (delete_event + create_calendar_event).
 */
export function buildUpdateEventTool(): ToolDefinition<UpdateEventInput> {
  return {
    name: 'update_event',
    description:
      'Reschedule a calendar event to a new timestart. To change name/description/location, delete + re-create (Moodle WS does not expose full event update).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const updateEventTool = buildUpdateEventTool();

async function execute(args: UpdateEventInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    await ctx.client.call('core_calendar_update_event_start_day', {
      eventid: args.event_id,
      daytimestamp: args.new_timestart,
    });

    return toJsonResponse({
      event_id: args.event_id,
      new_timestart: args.new_timestart,
      rescheduled: true,
    });
  } catch (e) {
    ctx.logger.warn('update_event.failed', {
      event_id: args.event_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
