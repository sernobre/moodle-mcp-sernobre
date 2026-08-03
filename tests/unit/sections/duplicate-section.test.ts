import { describe, it, expect } from 'vitest';
import { duplicateSectionTool } from '../../../src/tools/sections/duplicate_section.js';
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

describe('duplicate_section', () => {
  it('calls local_sernobre_mcp_duplicate_section with correct params', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_duplicate_section: (params) => {
        sent = params;
        return {
          action: 'created',
          section_id: 24,
          sectionnum: 5,
          duplicated_modules: 3,
        };
      },
    });

    const result = await duplicateSectionTool.handler(
      {
        course_id: 5,
        source_section_id: 12,
        name: 'Unit 3 - Copy',
        visible: true,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect(sent.source_section_id).toBe(12);
    expect(sent.name).toBe('Unit 3 - Copy');
    expect(sent.visible).toBe(1);

    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('created');
    expect(p.section_id).toBe(24);
    expect(p.sectionnum).toBe(5);
    expect(p.duplicated_modules).toBe(3);
  });

  it('handles exists action gracefully', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_duplicate_section: () => ({
        action: 'exists',
        section_id: 15,
        sectionnum: 3,
        duplicated_modules: 0,
      }),
    });

    const result = await duplicateSectionTool.handler(
      {
        course_id: 5,
        source_section_id: 12,
        name: 'Existent Section',
        visible: true,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('exists');
    expect(p.duplicated_modules).toBe(0);
  });

  it('defaults visible to true', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_duplicate_section: (params) => {
        sent = params;
        return { action: 'created', section_id: 1, sectionnum: 1, duplicated_modules: 0 };
      },
    });

    const result = await duplicateSectionTool.inputSchema.parseAsync({
      course_id: 5,
      source_section_id: 12,
      name: 'Test Section',
    }).then((parsed) => duplicateSectionTool.handler(parsed, ctx(client)));

    expect(sent.visible).toBe(1);
  });
});
