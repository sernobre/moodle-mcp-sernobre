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
    course_ids: z.array(z.number().int().positive()).default([]),
    group_ids: z.array(z.number().int().nonnegative()).default([]),
    category_ids: z.array(z.number().int().positive()).default([]),
    timestart: z.number().int().nonnegative().optional(),
    timeend: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ListCalendarEventsInput = z.infer<typeof InputSchema>;

interface WsEvent {
  id: number;
  name: string;
  timestart: number;
  timeduration: number;
  eventtype: string;
  courseid?: number;
  description?: string;
  location?: string;
}

export function buildListCalendarEventsTool(): ToolDefinition<ListCalendarEventsInput> {
  return {
    name: 'list_calendar_events',
    description:
      'List calendar events by courses/groups/categories, optionally filtered by a timestart/timeend range.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const listCalendarEventsTool = buildListCalendarEventsTool();

async function execute(
  args: ListCalendarEventsInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const params: Record<string, unknown> = {
      events: {
        courseids: args.course_ids,
        groupids: args.group_ids,
        categoryids: args.category_ids,
      },
      options: {
        userevents: 0,
        siteevents: 0,
      },
    };
    if (args.timestart !== undefined) {
      (params.options as Record<string, unknown>).timestart = args.timestart;
    }
    if (args.timeend !== undefined) {
      (params.options as Record<string, unknown>).timeend = args.timeend;
    }

    const result = (await ctx.client.call(
      'core_calendar_get_calendar_events',
      params,
    )) as { events?: WsEvent[] } | undefined;

    const events = (result?.events ?? []).map((e) => ({
      event_id: e.id,
      name: e.name,
      timestart: e.timestart,
      timeduration: e.timeduration,
      eventtype: e.eventtype,
      course_id: e.courseid ?? null,
      description: e.description ?? '',
      location: e.location ?? '',
    }));

    return toJsonResponse({
      count: events.length,
      events,
    });
  } catch (e) {
    ctx.logger.warn('list_calendar_events.failed', {
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
