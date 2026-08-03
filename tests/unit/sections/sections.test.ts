import { describe, it, expect, vi } from 'vitest';
import { createSectionTool } from '../../../src/tools/sections/create_section.js';
import { updateSectionTool } from '../../../src/tools/sections/update_section.js';
import {
  hideSectionTool,
  releaseSectionTool,
} from '../../../src/tools/sections/visibility.js';
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

// ---------- create_section ----------

describe('create_section', () => {
  it('creates a section and updates its name/summary/visibility', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_sernobre_mcp_create_section: (params) => {
        calls.push({ fn: 'create', params });
        return { action: 'created', sectionid: 123, sectionnum: 5 };
      },
      local_sernobre_mcp_update_section: (params) => {
        calls.push({ fn: 'update', params });
        return { action: 'updated', sectionid: 77, sectionnum: 1 };
      },
    });

    const result = await createSectionTool.handler(
      {
        course_id: 42,
        name: 'Unit 4 — Family',
        summary: '<p>Description</p>',
        position: 0,
        visible: false,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('"section_id":123');
    expect(result.content[0]!.text).toContain('"sectionnum":5');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'create',
      params: {
        courseid: 42,
        name: 'Unit 4 — Family',
        summary: '<p>Description</p>',
        summaryformat: 1,
        position: 0,
        visible: 0,
      },
    });
  });

  it('returns an error when the plugin returns an empty list', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_create_section: () => undefined,
      local_sernobre_mcp_update_section: () => [],
    });

    const result = await createSectionTool.handler(
      { course_id: 42, name: 'X', summary: '', position: 0, visible: true },
      ctx(client),
    );

    expect(result.isError).toBe(true);
    expect(result.meta?.code).toBe('MOODLE_WS_PLUGIN_ERROR');
  });
});

// ---------- update_section ----------

describe('update_section', () => {
  it('forwards only the fields that are provided', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_update_section: (params) => {
        Object.assign(seen, params);
        return { action: 'updated', sectionid: 77, sectionnum: 1 };
      },
    });

    const result = await updateSectionTool.handler(
      {
        course_id: 42,
        section_id: 77,
        name: 'New unit',
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(seen).toEqual({ courseid: 42, sectionid: 77, name: 'New unit' });
    expect(seen).not.toHaveProperty('summary');
    expect(seen).not.toHaveProperty('visible');
  });

  it('maps summary + summaryformat when summary is set', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_update_section: (params) => {
        Object.assign(seen, params);
        return { action: 'updated', sectionid: 77, sectionnum: 1 };
      },
    });

    await updateSectionTool.handler(
      { course_id: 42, section_id: 77, summary: 'Description' },
      ctx(client),
    );

    expect(seen.summary).toBe('Description');
    expect(seen.summaryformat).toBe(1);
  });

  it('rejects input when no field is provided', () => {
    expect(() =>
      updateSectionTool.inputSchema.parse({ course_id: 42, section_id: 77 }),
    ).toThrow();
  });
});

// ---------- hide / release ----------

describe('hide_section / release_section', () => {
  it('hide sends visible=0', async () => {
    let seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_update_section: (params) => {
        seen = params;
        return { action: 'updated', sectionid: 77, sectionnum: 1 };
      },
    });

    await hideSectionTool.handler({ course_id: 42, section_id: 77 }, ctx(client));

    expect(seen).toEqual({ courseid: 42, sectionid: 77, visible: 0 });
  });

  it('release sends visible=1', async () => {
    let seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_update_section: (params) => {
        seen = params;
        return { action: 'updated', sectionid: 77, sectionnum: 1 };
      },
    });

    await releaseSectionTool.handler({ course_id: 42, section_id: 77 }, ctx(client));

    expect(seen).toEqual({ courseid: 42, sectionid: 77, visible: 1 });
  });

  it('surfaces error as toolResponse when WS throws', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      local_sernobre_mcp_update_section: () => {
        throw new Error('permission denied');
      },
    });

    const result = await hideSectionTool.handler(
      { course_id: 42, section_id: 77 },
      { client, logger },
    );

    expect(result.isError).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'hide_section.failed',
      expect.objectContaining({ section_id: 77 }),
    );
  });
});


