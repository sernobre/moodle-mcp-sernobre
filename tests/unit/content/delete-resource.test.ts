import { describe, it, expect } from 'vitest';
import { deleteResourceTool } from '../../../src/tools/content/delete_resource.js';
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

describe('delete_resource', () => {
  it('allows deleting mcp: prefixed idnumbers by default', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_delete_module_by_idnumber: (params) => {
        sent = params;
        return { action: 'deleted', cmid: 42 };
      },
    });

    const result = await deleteResourceTool.handler(
      { course_id: 5, idnumber: 'mcp:module:abc123', force: false },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect(sent.idnumber).toBe('mcp:module:abc123');

    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('deleted');
    expect(p.cmid).toBe(42);
  });

  it('rejects non-mcp idnumbers without force=true', async () => {
    const client = scriptedClient({
      // Should not be called.
      local_sernobre_mcp_delete_module_by_idnumber: () => {
        throw new Error('should not be called');
      },
    });

    const result = await deleteResourceTool.handler(
      { course_id: 5, idnumber: 'manual:section:1', force: false },
      ctx(client),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('non-MCP');
    expect(result.content[0]?.text).toContain('manual:section:1');
  });

  it('deletes non-mcp idnumbers when force=true', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_delete_module_by_idnumber: (params) => {
        return { action: 'deleted', cmid: 99 };
      },
    });

    const result = await deleteResourceTool.handler(
      { course_id: 5, idnumber: 'manual-resource', force: true },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('deleted');
  });

  it('handles noop when idnumber does not exist', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_delete_module_by_idnumber: () => ({
        action: 'noop',
        cmid: null,
      }),
    });

    const result = await deleteResourceTool.handler(
      { course_id: 5, idnumber: 'mcp:module:nonexistent', force: false },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    const p = JSON.parse(result.content[0]!.text);
    expect(p.action).toBe('noop');
    expect(p.cmid).toBeNull();
  });
});
