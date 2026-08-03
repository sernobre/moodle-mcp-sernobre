import { describe, it, expect } from 'vitest';
import { createCalendarEventTool } from '../../../src/tools/calendar/create_calendar_event.js';
import { listCalendarEventsTool } from '../../../src/tools/calendar/list_calendar_events.js';
import { updateEventTool } from '../../../src/tools/calendar/update_event.js';
import { deleteEventTool } from '../../../src/tools/calendar/delete_event.js';
import { listUserBadgesTool } from '../../../src/tools/badges/list_user_badges.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts): MoodleClient {
  return {
    baseUrl: 'https://moodle.example.com',
    async call(fn, params = {}) {
      const f = scripts[fn];
      if (!f) throw new Error(`unexpected WS call: ${fn}`);
      return await f(params);
    },
  };
}

function ctx(client: MoodleClient) {
  return { client, logger: nullLogger };
}

describe('create_calendar_event', () => {
  it('creates a course-scoped event with duration and repeats', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_create_calendar_events: (params) => {
        sent = params;
        return {
          events: [
            { id: 10, name: 'Lesson', timestart: 1_000_000_000, eventtype: 'course' },
          ],
        };
      },
    });

    const result = await createCalendarEventTool.handler(
      {
        course_id: 5,
        name: 'Lesson',
        description: '',
        eventtype: 'course',
        timestart: 1_000_000_000,
        timeduration: 3600,
        location: 'Zoom',
        repeat_count: 4,
      },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.created_count).toBe(1);
    expect(p.events[0].event_id).toBe(10);
    const ev = (sent.events as Array<Record<string, unknown>>)[0]!;
    expect(ev.courseid).toBe(5);
    expect(ev.repeats).toBe(4);
  });

  it('omits courseid when event is user-type', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_create_calendar_events: (params) => {
        sent = params;
        return { events: [{ id: 1, name: 'x', timestart: 1, eventtype: 'user' }] };
      },
    });

    await createCalendarEventTool.handler(
      {
        name: 'x',
        description: '',
        eventtype: 'user',
        timestart: 1,
        timeduration: 0,
        location: '',
        repeat_count: 0,
      },
      ctx(client),
    );

    const ev = (sent.events as Array<Record<string, unknown>>)[0]!;
    expect(ev.courseid).toBeUndefined();
  });
});

describe('list_calendar_events', () => {
  it('passes courseids + timestart/timeend in options', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_get_calendar_events: (params) => {
        sent = params;
        return { events: [{ id: 1, name: 'x', timestart: 100, timeduration: 0, eventtype: 'course' }] };
      },
    });

    await listCalendarEventsTool.handler(
      {
        course_ids: [5, 6],
        group_ids: [],
        category_ids: [],
        timestart: 100,
        timeend: 200,
      },
      ctx(client),
    );

    const events = sent.events as Record<string, unknown>;
    expect(events.courseids).toEqual([5, 6]);
    const opts = sent.options as Record<string, unknown>;
    expect(opts.timestart).toBe(100);
    expect(opts.timeend).toBe(200);
  });
});

describe('update_event', () => {
  it('calls update_event_start_day with event id and new timestamp', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_update_event_start_day: (params) => {
        sent = params;
        return null;
      },
    });

    await updateEventTool.handler(
      { event_id: 99, new_timestart: 2_000_000_000 },
      ctx(client),
    );

    expect(sent.eventid).toBe(99);
    expect(sent.daytimestamp).toBe(2_000_000_000);
  });
});

describe('delete_event', () => {
  it('sends batched delete with repeat=0 by default', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_delete_calendar_events: (params) => {
        sent = params;
        return null;
      },
    });

    await deleteEventTool.handler(
      { event_ids: [1, 2, 3], delete_repeats: false },
      ctx(client),
    );

    const events = sent.events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ eventid: 1, repeat: 0 });
  });

  it('sends repeat=1 when delete_repeats=true', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_calendar_delete_calendar_events: (params) => {
        sent = params;
        return null;
      },
    });

    await deleteEventTool.handler(
      { event_ids: [1], delete_repeats: true },
      ctx(client),
    );

    const events = sent.events as Array<Record<string, unknown>>;
    expect((events[0]! as Record<string, number>).repeat).toBe(1);
  });
});

describe('list_user_badges', () => {
  it('returns flattened badge list with filter when course_id set', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_badges_get_user_badges: (params) => {
        sent = params;
        return {
          badges: [
            {
              id: 10,
              name: 'Complete A1',
              description: 'ok',
              badgeurl: 'https://x',
              dateissued: 100,
              issuername: 'Alice',
              courseid: 5,
            },
          ],
        };
      },
    });

    const result = await listUserBadgesTool.handler(
      { user_id: 42, course_id: 5 },
      ctx(client),
    );

    expect(sent.userid).toBe(42);
    expect(sent.courseid).toBe(5);
    const p = JSON.parse(result.content[0]!.text);
    expect(p.count).toBe(1);
    expect(p.badges[0].issued_at).toBe(100);
  });

  it('omits courseid param when filter not set', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_badges_get_user_badges: (params) => {
        sent = params;
        return { badges: [] };
      },
    });

    await listUserBadgesTool.handler({ user_id: 42 }, ctx(client));

    expect(sent.courseid).toBeUndefined();
  });
});
