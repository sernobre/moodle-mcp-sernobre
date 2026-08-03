import { describe, expect, it } from 'vitest';
import { createQuizTool, updateQuizTool } from '../../../src/tools/assessment/quiz-crud.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

function context(seen: Record<string, unknown>) {
  const client: MoodleClient = {
    baseUrl: 'https://moodle.example.com',
    call: async (_name, params = {}) => { Object.assign(seen, params); return { action: 'updated', cmid: 10, instanceid: 20, url: 'https://moodle.example.com/mod/quiz/view.php?id=10' }; },
  };
  return { client, logger: nullLogger };
}

const input = { course_id: 2, section_num: 1, slug: 'quiz-1', name: 'Quiz 1', intro: '<p>Intro</p>', timeopen: 0, timeclose: 0, timelimit_seconds: 600, attempts: 2, grademethod: 'highest' as const, grade: 10, visible: true };

describe('quiz CRUD', () => {
  it('creates a quiz shell with stable idnumber', async () => {
    const seen: Record<string, unknown> = {};
    const result = await createQuizTool.handler(input, context(seen));
    expect(result.isError).toBeUndefined();
    expect(seen.courseid).toBe(2); expect(seen.timelimit).toBe(600); expect(seen.attempts).toBe(2);
    expect(seen.idnumber).toMatch(/^mcp:quiz:[0-9a-f]{20}$/);
  });
  it('edits a quiz through the same idempotent endpoint', async () => {
    const seen: Record<string, unknown> = {};
    const result = await updateQuizTool.handler({ ...input, name: 'Quiz 1 edited' }, context(seen));
    expect(result.isError).toBeUndefined(); expect(seen.name).toBe('Quiz 1 edited');
  });
});
