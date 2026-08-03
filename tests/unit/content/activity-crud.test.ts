import { describe, expect, it } from 'vitest';
import { createActivityTool, updateActivityTool } from '../../../src/tools/content/activity.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

function client(fn: (name: string, params: Record<string, unknown>) => unknown): MoodleClient {
  return { baseUrl: 'https://moodle.example.com', call: async (name, params = {}) => fn(name, params) };
}
describe('activity CRUD', () => {
  it('routes page creation and renders markdown', async () => {
    let sent: Record<string, unknown> = {};
    const result = await createActivityTool.handler({ type: 'page', course_id: 3, section_num: 1, idnumber: 'unit-1', name: 'Intro', intro: 'Short', content: '**hello**', visible: true }, { client: client((name, params) => { expect(name).toBe('local_sernobre_mcp_upsert_page'); sent = params; return { action: 'created', cmid: 4, instanceid: 5, url: 'https://x' }; }), logger: nullLogger });
    expect(result.isError).toBeUndefined(); expect(sent.courseid).toBe(3); expect(sent.content).toContain('<strong>hello</strong>');
  });
  it('routes assignment edits', async () => {
    const result = await updateActivityTool.handler({ type: 'assign', course_id: 3, section_num: 0, idnumber: 'a1', name: 'Task', intro: '', visible: true, description: 'Do it', due_date: 0, submissions_from: 0, cutoff_date: 0, grade: 100 }, { client: client((name) => { expect(name).toBe('local_sernobre_mcp_upsert_assignment'); return { action: 'updated', cmid: 4, instanceid: 5, url: 'https://x' }; }), logger: nullLogger });
    expect(result.isError).toBeUndefined();
  });
});
