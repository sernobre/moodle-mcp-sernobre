import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCourseContextTool } from '../../src/tools/course/get_course_context.js';
import { publishClassLessonTool } from '../../src/tools/content/publish_class_lesson.js';
import { extractComponentBodies } from '../../src/tools/content/publish/lesson-bodies.js';
import { publishPreviewTool } from '../../src/tools/content/publish_preview.js';
import { confirmPreviewTool } from '../../src/tools/content/confirm_preview.js';
import { nullLogger } from '../../src/utils/logger.js';
import type { MoodleClient } from '../../src/client/moodle-client.js';
import type { ToolContext } from '../../src/tools/types.js';
import { buildIdnumber, buildSectionIdnumber } from '../../src/utils/idempotency.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://moodle.example.com'): MoodleClient {
  return {
    baseUrl,
    async call(functionName, params = {}) {
      const fn = scripts[functionName];
      if (!fn) throw new Error(`unexpected WS call: ${functionName}`);
      return await fn(params);
    },
  };
}

function ctx(client: MoodleClient): ToolContext {
  return { client, logger: nullLogger };
}

// ---------- extractComponentBodies ----------

describe('extractComponentBodies', () => {
  it('splits markdown by {#id} anchors', () => {
    const md = `
Preamble

## Opening (10 min) {#opening}
Initial greeting.

## Closing (5 min) {#closing}
Farewell.
`;
    const out = extractComponentBodies(md);
    expect(Object.keys(out)).toEqual(['opening', 'closing']);
    expect(out.opening).toContain('Initial greeting');
    expect(out.closing).toContain('Farewell');
  });

  it('returns empty object when no anchors', () => {
    expect(extractComponentBodies('just plain markdown')).toEqual({});
  });

  it('handles trailing content after last anchor', () => {
    const md = `## Title {#only}\nBody text`;
    expect(extractComponentBodies(md).only).toBe('Body text');
  });
});

// ---------- get_course_context ----------

describe('getCourseContextTool', () => {
  const lessonId = 'ai-fundamentals-2026-u1-c1';
  const mcpIdnumber = buildIdnumber('module', `${lessonId}|opening`);

  it('returns a full context snapshot', async () => {
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({
        courses: [
          {
            id: 42,
            fullname: 'AI Fundamentals A1',
            shortname: 'AI-A1',
            format: 'topics',
            startdate: 1700000000,
            visible: 1,
          },
        ],
      }),
      core_course_get_contents: () => [
        {
          id: 100,
          name: 'General',
          section: 0,
          visible: 1,
          modules: [
            { id: 1, name: 'Welcome', modname: 'page', instance: 1, visible: 1 },
            { id: 2, name: 'Lesson 5', modname: 'page', instance: 2, visible: 0, idnumber: mcpIdnumber },
          ],
        },
      ],
      core_enrol_get_enrolled_users: () => [
        { id: 1, fullname: 'Alice', roles: [{ roleid: 3, shortname: 'editingteacher' }] },
        { id: 2, fullname: 'Student A', roles: [{ roleid: 5, shortname: 'student' }] },
        { id: 3, fullname: 'Student B', roles: [] },
      ],
    });
    const res = await getCourseContextTool.handler(
      { course_id: 42, include_recent_lessons: 5 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.course.id).toBe(42);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].modules_count).toBe(2);
    expect(data.recent_lessons).toHaveLength(1);
    expect(data.recent_lessons[0].lesson_idnumber).toBe(mcpIdnumber);
    expect(data.enrolments).toEqual({ total: 3, teachers: 1, students: 2 });
  });

  it('surfaces an error if the course does not exist', async () => {
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({ courses: [] }),
      core_course_get_contents: () => [],
      core_enrol_get_enrolled_users: () => [],
    });
    const res = await getCourseContextTool.handler(
      { course_id: 999, include_recent_lessons: 5 },
      ctx(client),
    );
    expect(res.isError).toBe(true);
    expect(res.meta).toMatchObject({ code: 'MOODLE_WS_COURSE_NOT_FOUND' });
  });
});

// ---------- publish_class_lesson ----------

describe('publishClassLessonTool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moodle-mcp-test-'));
  const lessonPath = join(dir, 'lesson.md');

  const lessonYaml = `---
id: ai-fundamentals-2026-u1-c1
type: lesson
language: english
program: ai-fundamentals-2026
unit: 1
order: 1
duration_min: 90
modality: virtual
student_profile: adult
observable_objectives:
  - o1
components:
  - { id: opening, type: text, minutes: 10 }
  - { id: closing, type: text, minutes: 5 }
moodle:
  course_id: 42
---

## Opening {#opening}
Greeting.

## Closing {#closing}
Farewell.
`;

  writeFileSync(lessonPath, lessonYaml, 'utf8');

  afterAll();
  function afterAll() {
    // vitest-like teardown via process hook
    process.once('exit', () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
  }

  const sectionIdnumber = buildSectionIdnumber('ai-fundamentals-2026-u1-c1');
  const openingIdnumber = buildIdnumber('module', 'ai-fundamentals-2026-u1-c1|opening');

  it('rejects non-absolute lesson_path', async () => {
    expect(() =>
      publishClassLessonTool.inputSchema.parse({
        lesson_path: './rel.md',
        course_id: 42,
      }),
    ).toThrow(/absolute/);
  });

  it('reads the lesson, plans, and creates/updates pages via local_sernobre_mcp', async () => {
    const upsertCalls: Array<Record<string, unknown>> = [];
    const client = scriptedClient({
      core_course_get_contents: () => [
        {
          id: 200,
          name: 'Lesson 1',
          section: 5,
          visible: 0,
          modules: [
            { id: 501, name: 'Opening', modname: 'page', instance: 1, idnumber: openingIdnumber, visible: 0 },
          ],
        },
      ],
      local_sernobre_mcp_update_section: async () => null,
      local_sernobre_mcp_upsert_page: (params) => {
        upsertCalls.push(params);
        const idn = String(params.idnumber);
        const existing = idn === openingIdnumber;
        return {
          action: existing ? 'updated' : 'created',
          cmid: existing ? 501 : 700 + upsertCalls.length,
          instanceid: 1 + upsertCalls.length,
          url: `https://example/mod/page/view.php?id=${existing ? 501 : 700 + upsertCalls.length}`,
          contentlen: String(params.content).length,
        };
      },
    });
    const res = await publishClassLessonTool.handler(
      { lesson_path: lessonPath, course_id: 42, mode: 'hidden' },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.section.idnumber).toBe(sectionIdnumber);
    expect(data.resources).toHaveLength(2);
    const opening = data.resources.find((r: { component_id: string }) => r.component_id === 'opening');
    expect(opening.status).toBe('updated');
    expect(opening.moodle_id).toBe(501);
    const closing = data.resources.find((r: { component_id: string }) => r.component_id === 'closing');
    expect(closing.status).toBe('created');
    expect(upsertCalls).toHaveLength(2);
    // Style wrapping is applied: HTML content starts with <div style=
    const openingCall = upsertCalls.find((c) => c.idnumber === openingIdnumber)!;
    expect(String(openingCall.content)).toMatch(/^<div style="/);
    const openingResource = data.resources.find((r: { component_id: string }) => r.component_id === 'opening');
    expect(openingResource.contentlen).toBe(String(openingCall.content).length);
  });

  it('respects explicit section_id override', async () => {
    const client = scriptedClient({
      core_course_get_contents: () => [
        { id: 300, name: 'Target', section: 3, visible: 1, modules: [] },
        { id: 301, name: 'Other', section: 4, visible: 1, modules: [] },
      ],
      local_sernobre_mcp_update_section: async () => null,
    });
    const res = await publishClassLessonTool.handler(
      { lesson_path: lessonPath, course_id: 42, section_id: 300, mode: 'visible' },
      ctx(client),
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.section.id).toBe(300);
  });

  it('emits a warning when a component has no markdown body (no {#id} anchor)', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'moodle-mcp-test-empty-'));
    const emptyPath = join(emptyDir, 'lesson.md');
    process.once('exit', () => {
      try {
        rmSync(emptyDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
    writeFileSync(
      emptyPath,
      `---
id: ai-fundamentals-2026-u1-c1
type: lesson
language: english
program: ai-fundamentals-2026
unit: 1
order: 1
duration_min: 90
modality: virtual
student_profile: adult
observable_objectives:
  - o1
components:
  - { id: opening, type: text, minutes: 10 }
moodle:
  course_id: 42
---

# Body with no {#opening} anchor at all
`,
      'utf8',
    );
    const client = scriptedClient({
      core_course_get_contents: () => [
        { id: 200, name: 'Lesson 1', section: 5, visible: 1, modules: [] },
      ],
      local_sernobre_mcp_update_section: async () => null,
      local_sernobre_mcp_upsert_page: (params) => ({
        action: 'created',
        cmid: 777,
        instanceid: 1,
        url: 'https://example/mod/page/view.php?id=777',
        contentlen: String(params.content).length,
      }),
    });
    const res = await publishClassLessonTool.handler(
      { lesson_path: emptyPath, course_id: 42, mode: 'hidden' },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.warnings.some((w: string) => /EMPTY content/.test(w))).toBe(true);
    const opening = data.resources.find((r: { component_id: string }) => r.component_id === 'opening');
    expect(opening.contentlen).toBe(0);
  });
});

// ---------- publish_preview ----------

describe('publishPreviewTool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moodle-mcp-test-preview-'));
  const lessonPath = join(dir, 'lesson.md');
  writeFileSync(
    lessonPath,
    `---
id: test-lesson
type: lesson
language: english
program: test
unit: 1
order: 1
duration_min: 60
modality: virtual
student_profile: adult
observable_objectives:
  - o1
components:
  - { id: x, type: text, minutes: 5 }
moodle:
  course_id: 7
---

## X {#x}
content
`,
    'utf8',
  );
  process.once('exit', () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {/**/}
  });

  it('publishes hidden and appends preview_url', async () => {
    const client = scriptedClient(
      {
        core_course_get_contents: () => [
          { id: 400, name: 'Home', section: 0, visible: 1, modules: [] },
        ],
        local_sernobre_mcp_update_section: async () => null,
      },
      'https://moodle.italicia.com',
    );
    const res = await publishPreviewTool.handler(
      { lesson_path: lessonPath, course_id: 7 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.preview_url).toBe(
      'https://moodle.italicia.com/course/view.php?id=7#section-400',
    );
  });
});

// ---------- confirm_preview ----------

describe('confirmPreviewTool', () => {
  it('updates the section visibility via local_sernobre_mcp_update_section', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_sernobre_mcp_update_section: (params) => {
        calls.push({ fn: 'local_sernobre_mcp_update_section', params });
        return null;
      },
    });
    const res = await confirmPreviewTool.handler(
      { section_id: 500, course_id: 42 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.section).toEqual({ id: 500, now_visible: true });
    expect(data.resources_released).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toMatchObject({
      courseid: 42,
      sectionid: 500,
      visible: 1,
    });
  });

  it('ignores resource_ids with a warning but still propagates visibility', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_update_section: () => null,
    });
    const res = await confirmPreviewTool.handler(
      { section_id: 500, course_id: 42, resource_ids: [1, 2, 3] },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.resources_released).toBe(3);
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toMatch(/section level/i);
  });

  it('rejects invalid input', () => {
    expect(() =>
      confirmPreviewTool.inputSchema.parse({ section_id: 0, course_id: 1 }),
    ).toThrow();
    expect(() =>
      confirmPreviewTool.inputSchema.parse({ section_id: 1 }),
    ).toThrow();
  });
});

