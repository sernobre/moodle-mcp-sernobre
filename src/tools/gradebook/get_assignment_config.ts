import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive().describe('Moodle course ID.'),
    idnumber: z
      .string()
      .min(1)
      .optional()
      .describe('If set, only the assignment with this idnumber.'),
    cmid: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('If set, only the course_module with this id.'),
  })
  .strict();

export type GetAssignmentConfigInput = z.infer<typeof InputSchema>;

interface PluginConfigRow {
  plugin: string;
  subtype: string;
  name: string;
  value: string;
}

interface WsAssignment {
  cmid: number;
  instanceid: number;
  idnumber: string;
  name: string;
  duedate: number;
  allowsubmissionsfromdate: number;
  cutoffdate: number;
  grade: number;
  visible: number;
  nosubmissions: number;
  submission_file_enabled: number;
  submission_onlinetext_enabled: number;
  submission_comments_enabled: number;
  maxfilesubmissions: number;
  wordlimit: number;
  maxsubmissionsizebytes: number;
  plugin_config: PluginConfigRow[];
}

/**
 * Read-only: submission configuration of each assignment in a course.
 *
 * Moodle's webservices expose no read function for the enabled assignment
 * submission plugins, so this wraps the companion `local_sernobre_mcp_get_assignment_config`
 * endpoint. Use it to confirm which assignments accept file and/or online-text
 * submissions before calling `submit_assignment_file` / `save_submission`.
 */
export function buildGetAssignmentConfigTool(): ToolDefinition<GetAssignmentConfigInput> {
  return {
    name: 'get_assignment_config',
    description:
      'Submission configuration of assignments in a course (read-only): enabled submission plugins (file / online text), max files, word limit, due dates. Use to check what a given assignment accepts before submitting.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const getAssignmentConfigTool = buildGetAssignmentConfigTool();

async function execute(
  args: GetAssignmentConfigInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const params: Record<string, unknown> = { courseid: args.course_id };
    if (args.idnumber) params.idnumber = args.idnumber;
    if (args.cmid) params.cmid = args.cmid;

    const raw = (await ctx.client.call(
      'local_sernobre_mcp_get_assignment_config',
      params,
    )) as { assignments?: WsAssignment[] } | undefined;

    const assignments = (raw?.assignments ?? []).map((a) => ({
      cmid: a.cmid,
      instance_id: a.instanceid,
      idnumber: a.idnumber,
      name: a.name,
      due_date: a.duedate,
      allow_submissions_from: a.allowsubmissionsfromdate,
      cutoff_date: a.cutoffdate,
      grade: a.grade,
      visible: a.visible === 1,
      accepts_submissions: a.nosubmissions === 0,
      submission_file_enabled: a.submission_file_enabled === 1,
      submission_onlinetext_enabled: a.submission_onlinetext_enabled === 1,
      feedback_comments_enabled: a.submission_comments_enabled === 1,
      max_files: a.maxfilesubmissions,
      word_limit: a.wordlimit,
      max_file_size_bytes: a.maxsubmissionsizebytes,
      plugin_config: a.plugin_config,
    }));

    return toJsonResponse({
      course_id: args.course_id,
      assignments_count: assignments.length,
      assignments,
    });
  } catch (e) {
    ctx.logger.warn('get_assignment_config.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
