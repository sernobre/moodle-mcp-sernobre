import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';
import {
  CoursesByFieldResponseSchema,
  CourseContentsResponseSchema,
  EnrolledUsersResponseSchema,
  TEACHER_ROLE_SHORTNAMES,
} from '../../schemas/moodle-responses.js';
import { isMcpIdnumber } from '../../utils/idempotency.js';
import { MoodleWsError } from '../../client/errors.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    include_recent_lessons: z
      .number()
      .int()
      .nonnegative()
      .default(5),
  })
  .strict();

export type GetCourseContextInput = z.infer<typeof InputSchema>;

/**
 * High-level snapshot of a Moodle course: metadata, sections (with module
 * counts), the latest lessons published through this MCP, and enrolment
 * counts split into teachers vs students. Mirrors CONTEXT §5.1.
 */
export const getCourseContextTool: ToolDefinition<GetCourseContextInput> = {
  name: 'get_course_context',
  description:
    'Returns a compact radiograph of a Moodle course: metadata, sections with module counts, recent MCP-published lessons, and enrolment counts (teachers vs students). Call this before publishing a lesson so the agent knows where it fits.',
  inputSchema: InputSchema,
  async handler(args, ctx) {
    ctx.logger.debug('get_course_context.start', { course_id: args.course_id });
    try {
      const [coursesRaw, contentsRaw, usersRaw] = await Promise.all([
        ctx.client.call('core_course_get_courses_by_field', {
          field: 'id',
          value: args.course_id,
        }),
        ctx.client.call('core_course_get_contents', {
          courseid: args.course_id,
        }),
        ctx.client.call('core_enrol_get_enrolled_users', {
          courseid: args.course_id,
        }),
      ]);

      const courses = CoursesByFieldResponseSchema.parse(coursesRaw);
      const sections = CourseContentsResponseSchema.parse(contentsRaw);
      const users = EnrolledUsersResponseSchema.parse(usersRaw);

      const course = courses.courses[0];
      if (!course) {
        throw new MoodleWsError(`Course ${args.course_id} not found`, {
          code: 'MOODLE_WS_COURSE_NOT_FOUND',
          functionName: 'core_course_get_courses_by_field',
          details: { course_id: args.course_id },
        });
      }

      const sectionSummaries = sections.map((s) => ({
        id: s.id,
        name: s.name,
        section: s.section,
        summary: s.summary ?? '',
        visible: s.visible ?? true,
        modules_count: s.modules.length,
      }));

      const mcpSections = sections.filter((s) =>
        s.modules.some((m) => m.idnumber && isMcpIdnumber(m.idnumber)),
      );
      const take = Math.min(args.include_recent_lessons, mcpSections.length);
      const recent_lessons = mcpSections.slice(-take).map((s) => {
        const mcpModule = s.modules.find(
          (m) => m.idnumber && isMcpIdnumber(m.idnumber),
        );
        return {
          section_id: s.id,
          section_name: s.name,
          // Moodle WS does not expose a "publishedAt" — callers that need it
          // should query audit logs. We surface the idnumber, which is stable.
          lesson_idnumber: mcpModule?.idnumber,
        };
      });

      let teachers = 0;
      let students = 0;
      for (const u of users) {
        const isTeacher = u.roles.some((r) =>
          TEACHER_ROLE_SHORTNAMES.has(r.shortname),
        );
        if (isTeacher) teachers += 1;
        else students += 1;
      }

      return toJsonResponse({
        course: {
          id: course.id,
          fullname: course.fullname,
          shortname: course.shortname,
          format: course.format ?? 'topics',
          startdate: course.startdate ?? 0,
        },
        sections: sectionSummaries,
        recent_lessons,
        enrolments: {
          total: users.length,
          teachers,
          students,
        },
      });
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};
