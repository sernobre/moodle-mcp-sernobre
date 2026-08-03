import { describe, expect, it } from 'vitest';
import { ensureSection } from '../../../src/tools/content/publish/ensure-section.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';
import type { Plan } from '../../../src/adapters/lesson-to-moodle.js';

const plan: Plan = {
  section: { idnumber: 'mcp:section:x', name: 'Lesson 1 — English u1', summary: '', preferred_section_id: null, visible: true },
  operations: [{ kind: 'upsert_page', idnumber: 'mcp:module:x', component_id: 'exercise', name: 'Exercise', content_markdown: '', visible: true, asset_refs: [] }],
};

function context(calls: string[]) {
  const client: MoodleClient = {
    baseUrl: 'https://moodle.example.com',
    call: async (name) => { calls.push(name); return {}; },
  };
  return { client, logger: nullLogger };
}

describe('ensureSection', () => {
  it('reuses an existing section by normalized name before creating one', async () => {
    const calls: string[] = [];
    const result = await ensureSection(context(calls), {
      contents: [{ id: 7, name: ' lesson 1 — ENGLISH u1 ', section: 3, modules: [] }],
      plan,
      exec: { courseId: 2, sectionIdOverride: undefined, lessonDir: '.' },
      warnings: [],
    });
    expect(result.section.id).toBe(7);
    expect(result.status).toBe('updated');
    expect(calls).toEqual(['local_sernobre_mcp_update_section']);
  });
});
