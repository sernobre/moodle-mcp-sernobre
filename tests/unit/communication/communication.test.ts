import { describe, it, expect } from 'vitest';
import { sendMoodleMessageTool } from '../../../src/tools/communication/send_moodle_message.js';
import { createForumAnnouncementTool } from '../../../src/tools/communication/create_forum_announcement.js';
import { createForumTool } from '../../../src/tools/communication/create_forum.js';
import { getCourseLogsTool } from '../../../src/tools/communication/get_course_logs.js';
import { getSiteInfoTool } from '../../../src/tools/communication/get_site_info.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://moodle.example.com'): MoodleClient {
  return {
    baseUrl,
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

describe('send_moodle_message', () => {
  it('maps recipients to one message per user with plain format default', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_message_send_instant_messages: (params) => {
        sent = params;
        return [
          { msgid: 1 },
          { msgid: 2 },
          { msgid: 3 },
        ];
      },
    });

    const result = await sendMoodleMessageTool.handler(
      { recipients: [10, 20, 30], text: 'Hello', format: 'plain' },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.sent).toBe(3);
    expect(p.failed).toBe(0);
    const msgs = sent.messages as Array<Record<string, unknown>>;
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toEqual({ touserid: 10, text: 'Hello', textformat: 0 });
  });

  it('counts failed when msgid <=0 or errormessage present', async () => {
    const client = scriptedClient({
      core_message_send_instant_messages: () => [
        { msgid: 1 },
        { msgid: -1, errormessage: 'unreachable' },
      ],
    });

    const result = await sendMoodleMessageTool.handler(
      { recipients: [10, 20], text: 'x', format: 'plain' },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.sent).toBe(1);
    expect(p.failed).toBe(1);
  });
});

describe('create_forum_announcement', () => {
  it('auto-resolves news forum when forum_id omitted', async () => {
    let discParams: Record<string, unknown> = {};
    const client = scriptedClient({
      mod_forum_get_forums_by_courses: () => [
        { id: 30, course: 5, type: 'general', name: 'Chit chat' },
        { id: 31, course: 5, type: 'news', name: 'Announcements' },
      ],
      mod_forum_add_discussion: (params) => {
        discParams = params;
        return { discussionid: 999 };
      },
    });

    const result = await createForumAnnouncementTool.handler(
      {
        course_id: 5,
        subject: 'Lesson moved to 7pm',
        message: '<p>Reminder</p>',
        pin: true,
        format: 'html',
      },
      ctx(client),
    );

    expect(discParams.forumid).toBe(31);
    const opts = discParams.options as Array<Record<string, unknown>>;
    expect(opts.find((o) => o.name === 'discussionpinned')?.value).toBe(1);
    const p = JSON.parse(result.content[0]!.text);
    expect(p.discussion_id).toBe(999);
  });

  it('falls back to first forum when there is no news forum', async () => {
    let discParams: Record<string, unknown> = {};
    const client = scriptedClient({
      mod_forum_get_forums_by_courses: () => [
        { id: 40, course: 5, type: 'general', name: 'Random' },
      ],
      mod_forum_add_discussion: (params) => {
        discParams = params;
        return { discussionid: 1 };
      },
    });

    await createForumAnnouncementTool.handler(
      { course_id: 5, subject: 's', message: 'm', pin: false, format: 'html' },
      ctx(client),
    );
    expect(discParams.forumid).toBe(40);
  });

  it('errors when no forums exist', async () => {
    const client = scriptedClient({
      mod_forum_get_forums_by_courses: () => [],
    });

    const result = await createForumAnnouncementTool.handler(
      { course_id: 5, subject: 's', message: 'm', pin: false, format: 'html' },
      ctx(client),
    );

    expect(result.isError).toBe(true);
    expect(result.meta?.code).toBe('MOODLE_WS_NO_FORUM');
  });
});

describe('get_course_logs', () => {
  it('flags users active within window and sorts by last_access desc', async () => {
    const now = Math.floor(Date.now() / 1000);
    const client = scriptedClient({
      core_enrol_get_enrolled_users: () => [
        { id: 1, fullname: 'Old', lastaccess: now - 3 * 24 * 3600 },
        { id: 2, fullname: 'Recent', lastaccess: now - 1800 },
        { id: 3, fullname: 'Never' },
      ],
    });

    const result = await getCourseLogsTool.handler(
      { course_id: 5, hours_since: 24 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.summary.total_enrolled).toBe(3);
    expect(p.summary.active_within_window).toBe(1);
    expect(p.summary.never_accessed).toBe(1);
    expect(p.users[0].user_id).toBe(2); // most recent first
  });
});

describe('get_site_info', () => {
  it('returns base info without functions by default', async () => {
    const client = scriptedClient({
      core_webservice_get_site_info: () => ({
        sitename: 'Moodle',
        username: 'bot',
        userid: 10,
        siteurl: 'https://moodle.example.com',
        release: '5.0.2',
        version: '2025100100',
        functions: [
          { name: 'core_x', version: '1' },
          { name: 'local_sernobre_mcp_upsert_page', version: '1' },
        ],
        uploadfiles: 1,
        downloadfiles: 1,
        lang: 'en',
      }),
    });

    const result = await getSiteInfoTool.handler(
      { include_functions: false },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.sitename).toBe('Moodle');
    expect(p.user.username).toBe('bot');
    expect(p.functions_count).toBe(2);
    expect(p.functions).toBeUndefined();
  });

  it('returns full list filtered by functions_filter when include_functions=true', async () => {
    const client = scriptedClient({
      core_webservice_get_site_info: () => ({
        sitename: 'A',
        username: 'b',
        userid: 1,
        siteurl: 'x',
        release: '5',
        version: '1',
        functions: [
          { name: 'core_x', version: '1' },
          { name: 'local_sernobre_mcp_upsert_page', version: '1' },
          { name: 'local_sernobre_mcp_upsert_url', version: '1' },
        ],
      }),
    });

    const result = await getSiteInfoTool.handler(
      { include_functions: true, functions_filter: 'sernobre_mcp' },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.functions_total).toBe(3);
    expect(p.functions_returned).toBe(2);
    expect(p.functions).toEqual([
      'local_sernobre_mcp_upsert_page',
      'local_sernobre_mcp_upsert_url',
    ]);
  });
});

// ---------- create_forum ----------

describe('create_forum', () => {
  it('builds idnumber mcp:forum:... and maps forum_type to plugin', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_upsert_forum: (params) => {
        sent = params;
        return {
          action: 'created',
          cmid: 200,
          instanceid: 75,
          url: 'https://moodle.example.com/mod/forum/view.php?f=75',
        };
      },
    });

    const result = await createForumTool.handler(
      {
        course_id: 5,
        section_num: 2,
        slug: 'general-discussion',
        name: 'General Discussion',
        intro: '<p>Forum for general discussion</p>',
        visible: false,
        forum_type: 'news',
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect(sent.sectionnum).toBe(2);
    expect((sent.idnumber as string).startsWith('mcp:forum:')).toBe(true);
    expect(sent.type).toBe('news');
    expect(sent.visible).toBe(0);

    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('created');
    expect(p.cmid).toBe(200);
    expect(p.forum_id).toBe(75);
    expect(p.forum_type).toBe('news');
  });

  it('defaults forum_type to general and visible to false', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_upsert_forum: (params) => {
        sent = params;
        return { action: 'updated', cmid: 1, instanceid: 1, url: 'https://x' };
      },
    });

    const result = await createForumTool.inputSchema.parseAsync({
      course_id: 5,
      slug: 'x',
      name: 'F',
    }).then((parsed) => createForumTool.handler(parsed, ctx(client)));

    expect(sent.type).toBe('general');
    expect(sent.visible).toBe(0);
  });
});
