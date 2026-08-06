import { describe, expect, it } from 'vitest';
import { submitAssignmentFileTool } from '../../../src/tools/gradebook/submit_assignment_file.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

describe('submit_assignment_file', () => {
  it('uploads files into one Moodle draft, saves the submission, and submits it', async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    let uploadCount = 0;

    const client: MoodleClient = {
      baseUrl: 'https://moodle.example.com',
      async call(name, params = {}) {
        calls.push({ name, params });
        if (name === 'core_webservice_get_site_info') return { userid: 42 };
        if (name === 'core_files_upload') {
          uploadCount += 1;
          return { itemid: uploadCount === 1 ? 900 : 900 };
        }
        if (name === 'mod_assign_save_submission') return [];
        if (name === 'mod_assign_submit_for_grading') return [];
        throw new Error('unexpected call: ' + name);
      },
    };

    const result = await submitAssignmentFileTool.handler(
      {
        assign_id: 50,
        files: [
          { filename: 'one.txt', content_base64: 'SGk=' },
          { filename: 'two.txt', content_base64: 'Qnk=' },
        ],
        submit_for_grading: true,
        accept_submission_statement: true,
      },
      { client, logger: nullLogger },
    );

    expect(result.isError).toBeUndefined();
    expect(calls.map((call) => call.name)).toEqual([
      'core_webservice_get_site_info',
      'core_files_upload',
      'core_files_upload',
      'mod_assign_save_submission',
      'mod_assign_submit_for_grading',
    ]);

    expect(calls[2]?.params.itemid).toBe(900);
    expect(calls[3]?.params).toEqual({
      assignmentid: 50,
      plugindata: { files_filemanager: 900 },
    });
    expect(calls[4]?.params).toEqual({
      assignmentid: 50,
      acceptsubmissionstatement: true,
    });

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.user_id).toBe(42);
    expect(payload.files_count).toBe(2);
    expect(payload.submitted).toBe(true);
  });
});
