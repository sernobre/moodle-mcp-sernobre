import { describe, expect, it } from 'vitest';
import { getAssignmentConfigTool } from '../../../src/tools/gradebook/get_assignment_config.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

describe('get_assignment_config', () => {
  it('calls the companion endpoint with courseid only and maps submission plugins to booleans', async () => {
    let sent: Record<string, unknown> = {};
    const client: MoodleClient = {
      baseUrl: 'https://moodle.example.com',
      async call(name, params = {}) {
        expect(name).toBe('local_sernobre_mcp_get_assignment_config');
        sent = params;
        return {
          assignments: [
            {
              cmid: 201,
              instanceid: 50,
              idnumber: 'mcp:assign:li01',
              name: 'Trabalho 1',
              duedate: 0,
              allowsubmissionsfromdate: 0,
              cutoffdate: 0,
              grade: 100,
              visible: 1,
              nosubmissions: 0,
              submission_file_enabled: 1,
              submission_onlinetext_enabled: 0,
              submission_comments_enabled: 1,
              maxfilesubmissions: 3,
              wordlimit: 0,
              maxsubmissionsizebytes: 0,
              plugin_config: [
                { plugin: 'file', subtype: 'assignsubmission', name: 'enabled', value: '1' },
                { plugin: 'file', subtype: 'assignsubmission', name: 'maxfilesubmissions', value: '3' },
                { plugin: 'onlinetext', subtype: 'assignsubmission', name: 'enabled', value: '0' },
              ],
            },
          ],
        };
      },
    };

    const result = await getAssignmentConfigTool.handler(
      { course_id: 5 },
      { client, logger: nullLogger },
    );

    expect(result.isError).toBeUndefined();
    expect(sent).toEqual({ courseid: 5 });

    const p = JSON.parse(result.content[0]!.text);
    expect(p.assignments_count).toBe(1);
    const a = p.assignments[0];
    expect(a.instance_id).toBe(50);
    expect(a.submission_file_enabled).toBe(true);
    expect(a.submission_onlinetext_enabled).toBe(false);
    expect(a.feedback_comments_enabled).toBe(true);
    expect(a.max_files).toBe(3);
    expect(a.plugin_config).toHaveLength(3);
  });

  it('forwards idnumber and cmid filters when provided', async () => {
    let sent: Record<string, unknown> = {};
    const client: MoodleClient = {
      baseUrl: 'https://moodle.example.com',
      async call(name, params = {}) {
        sent = params;
        return { assignments: [] };
      },
    };

    await getAssignmentConfigTool.handler(
      { course_id: 5, idnumber: 'mcp:assign:li01', cmid: 201 },
      { client, logger: nullLogger },
    );

    expect(sent).toEqual({ courseid: 5, idnumber: 'mcp:assign:li01', cmid: 201 });
  });

  it('surfaces WS errors as error responses', async () => {
    const client: MoodleClient = {
      baseUrl: 'https://moodle.example.com',
      async call() {
        throw new Error('Access denied');
      },
    };

    const result = await getAssignmentConfigTool.handler(
      { course_id: 999 },
      { client, logger: nullLogger },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Access denied');
  });
});
