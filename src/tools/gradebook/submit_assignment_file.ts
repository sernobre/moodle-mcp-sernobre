import { readFile } from 'node:fs/promises';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { z } from 'zod';

const FileInputSchema = z
  .object({
    path: z.string().min(1).optional().describe('Local path readable by the MCP process.'),
    content_base64: z
      .string()
      .min(1)
      .optional()
      .describe('Base64-encoded file content. Use this instead of path.'),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe('Filename for content_base64. For path, defaults to the path basename.'),
  })
  .strict()
  .refine((value) => Boolean(value.path) !== Boolean(value.content_base64), {
    message: 'Each file must provide exactly one of path or content_base64.',
  })
  .refine((value) => !value.content_base64 || Boolean(value.filename), {
    message: 'filename is required when content_base64 is used.',
  });

const InputSchema = z
  .object({
    assign_id: z.number().int().positive().describe('mod_assign instance id, not cmid.'),
    files: z
      .array(FileInputSchema)
      .min(1)
      .max(20)
      .describe('One or more files to attach to the current user submission.'),
    submit_for_grading: z
      .boolean()
      .default(true)
      .describe('If true, finalize the saved submission for grading.'),
    accept_submission_statement: z
      .boolean()
      .default(true)
      .describe('Whether to accept Moodle’s submission statement when finalizing.'),
  })
  .strict();

export type SubmitAssignmentFileInput = z.infer<typeof InputSchema>;

interface SiteInfo {
  userid?: number;
}

interface DraftUpload {
  itemid?: number;
}

function filenameOnly(value: string): string {
  const parts = value.split(/[\\/]/);
  const filename = parts[parts.length - 1]?.trim() ?? '';
  if (!filename || filename === '.' || filename === '..') {
    throw new Error('The submitted file has no valid filename.');
  }
  return filename;
}

function decodeBase64(value: string): Buffer {
  const normalised = value.replace(/\s+/g, '');
  if (
    normalised.length === 0 ||
    normalised.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)
  ) {
    throw new Error('content_base64 is not valid base64.');
  }
  return Buffer.from(normalised, 'base64');
}

function assertNoWarnings(operation: string, result: unknown): void {
  if (Array.isArray(result) && result.length > 0) {
    throw new Error(operation + ' returned Moodle warnings: ' + JSON.stringify(result));
  }
}

/**
 * Submit files through Moodle's native workflow:
 * user draft area -> mod_assign_save_submission -> optional final submit.
 */
export function buildSubmitAssignmentFileTool(): ToolDefinition<SubmitAssignmentFileInput> {
  return {
    name: 'submit_assignment_file',
    description:
      'Attach one or more local/base64 files to the current Moodle user’s assignment submission and optionally submit it for grading.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const submitAssignmentFileTool = buildSubmitAssignmentFileTool();

async function execute(
  args: SubmitAssignmentFileInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const site = (await ctx.client.call('core_webservice_get_site_info', {})) as SiteInfo;
    const userid = Number(site.userid);
    if (!Number.isInteger(userid) || userid <= 0) {
      throw new Error('Moodle did not return the current token user id.');
    }

    let draftItemId = 0;
    const uploaded: Array<{ filename: string; filesize: number }> = [];

    for (const file of args.files) {
      const content = file.path
        ? await readFile(file.path)
        : decodeBase64(file.content_base64!);
      const filename = filenameOnly(file.filename ?? file.path!);

      const draft = (await ctx.client.call('core_files_upload', {
        component: 'user',
        filearea: 'draft',
        itemid: draftItemId,
        filepath: '/',
        filename,
        filecontent: content.toString('base64'),
        contextlevel: 'user',
        instanceid: userid,
      })) as DraftUpload;

      const returnedItemId = Number(draft.itemid);
      if (!Number.isInteger(returnedItemId) || returnedItemId <= 0) {
        throw new Error('Moodle did not return a valid draft item id for ' + filename + '.');
      }
      draftItemId = returnedItemId;
      uploaded.push({ filename, filesize: content.length });
    }

    const saveResult = await ctx.client.call('mod_assign_save_submission', {
      assignmentid: args.assign_id,
      plugindata: { files_filemanager: draftItemId },
    });
    assertNoWarnings('mod_assign_save_submission', saveResult);

    let submitted = false;
    if (args.submit_for_grading) {
      const submitResult = await ctx.client.call('mod_assign_submit_for_grading', {
        assignmentid: args.assign_id,
        acceptsubmissionstatement: args.accept_submission_statement,
      });
      assertNoWarnings('mod_assign_submit_for_grading', submitResult);
      submitted = true;
    }

    return toJsonResponse({
      assign_id: args.assign_id,
      user_id: userid,
      files: uploaded,
      files_count: uploaded.length,
      saved: true,
      submitted,
    });
  } catch (e) {
    ctx.logger.warn('submit_assignment_file.failed', {
      assign_id: args.assign_id,
      files_count: args.files.length,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
