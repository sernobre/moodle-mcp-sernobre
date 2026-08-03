import { getCourseContextTool } from './get_course_context.js';
import { createCourseTool } from './create_course.js';
import { updateCourseTool } from './update_course.js';
import { duplicateCourseTool } from './duplicate_course.js';
import { archiveCourseTool } from './archive_course.js';
import { listMyCoursesTool } from './list_my_courses.js';

/** Course family: CRUD, duplicate, archive, context snapshot. */
export const COURSE_TOOLS = [
  getCourseContextTool,
  createCourseTool,
  updateCourseTool,
  duplicateCourseTool,
  archiveCourseTool,
  listMyCoursesTool,
];
