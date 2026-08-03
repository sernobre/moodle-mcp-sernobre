import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { publishClassLessonTool } from '../../src/tools/content/publish_class_lesson.js';
import { publishPreviewTool } from '../../src/tools/content/publish_preview.js';
import { confirmPreviewTool } from '../../src/tools/content/confirm_preview.js';
import { getCourseContextTool } from '../../src/tools/course/get_course_context.js';
import { nullLogger } from '../../src/utils/logger.js';
import type { MoodleClient } from '../../src/client/moodle-client.js';
import {
  readSandboxEnv,
  probeSandbox,
  buildSandboxClient,
} from './sandbox-setup.js';

/**
 * End-to-end integration tests against a real (docker) Moodle instance.
 *
 * These are skipped unless `MOODLE_TEST_TOKEN` is set. CI runs them after
 * bringing up the docker-compose stack (see
 * `docker-compose.test.yml`). Developers running locally typically do:
 *
 *   docker compose -f tests/integration/docker-compose.test.yml up -d
 *   export MOODLE_TEST_URL=http://localhost:8081
 *   export MOODLE_TEST_TOKEN=<token>
 *   export MOODLE_TEST_COURSE=2
 *   npm run test:integration
 *
 * The suite is also honest about v0.1 limits: it exercises the parts of
 * the pipeline that exist (section lookup + module visibility + idempotent
 * republish) and documents what is TODO for v0.2 (module creation via
 * `local_wsmanagesections`).
 */

const env = readSandboxEnv();
const itif = env ? it : it.skip;

const fixturePath = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'lesson-example.md',
);

describe('sernobre-moodle-mcp integration against docker Moodle', () => {
  let client: MoodleClient;
  let courseId = 0;

  beforeAll(async () => {
    if (!env) return;
    const info = await probeSandbox(env);
    if (!info) {
      throw new Error(
        'MOODLE_TEST_TOKEN is set but Moodle at MOODLE_TEST_URL is not reachable or the token is invalid. ' +
          'Start the docker sandbox and generate a token (see sandbox-setup.ts).',
      );
    }
    client = buildSandboxClient(env);
    courseId = env.courseId ?? 2; // caller should export MOODLE_TEST_COURSE to a real course
  });

  itif('get_course_context returns a realistic snapshot', async () => {
    const res = await getCourseContextTool.handler(
      { course_id: courseId, include_recent_lessons: 5 },
      { client, logger: nullLogger },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.course.id).toBe(courseId);
    expect(typeof data.enrolments.total).toBe('number');
  });

  itif('publish_class_lesson is idempotent', async () => {
    const first = await publishClassLessonTool.handler(
      { lesson_path: fixturePath, course_id: courseId, mode: 'hidden' },
      { client, logger: nullLogger },
    );
    const second = await publishClassLessonTool.handler(
      { lesson_path: fixturePath, course_id: courseId, mode: 'hidden' },
      { client, logger: nullLogger },
    );
    expect(first.isError).toBeFalsy();
    expect(second.isError).toBeFalsy();
    const d1 = JSON.parse(first.content[0]!.text);
    const d2 = JSON.parse(second.content[0]!.text);
    // Idempotency: the section the run targets is the same on both calls.
    expect(d2.section.id).toBe(d1.section.id);
    // Every resource with moodle_id in the 2nd run matches the 1st run.
    const firstById = new Map<string, number | null>(
      d1.resources.map((r: { component_id: string; moodle_id: number | null }) => [
        r.component_id,
        r.moodle_id,
      ]),
    );
    for (const r of d2.resources) {
      if (r.moodle_id !== null) {
        expect(firstById.get(r.component_id)).toBe(r.moodle_id);
      }
    }
  });

  itif('publish_preview then confirm_preview toggles visibility', async () => {
    const prev = await publishPreviewTool.handler(
      { lesson_path: fixturePath, course_id: courseId },
      { client, logger: nullLogger },
    );
    expect(prev.isError).toBeFalsy();
    const prevData = JSON.parse(prev.content[0]!.text);
    expect(typeof prevData.preview_url).toBe('string');

    const confirmed = await confirmPreviewTool.handler(
      {
        section_id: prevData.section.id,
        resource_ids: prevData.resources
          .filter((r: { moodle_id: number | null }) => r.moodle_id !== null)
          .map((r: { moodle_id: number }) => r.moodle_id),
      },
      { client, logger: nullLogger },
    );
    expect(confirmed.isError).toBeFalsy();
    const confirmedData = JSON.parse(confirmed.content[0]!.text);
    expect(confirmedData.section.now_visible).toBe(true);
  });
});
