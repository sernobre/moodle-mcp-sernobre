import { listStudentsTool } from './list_students.js';
import { enrolCsvTool } from './enrol_csv.js';
import { unenrolStudentTool } from './unenrol_student.js';
import { createGroupTool, assignToGroupTool } from './groups.js';
import { changeRoleTool } from './change_role.js';
import { resetPasswordTool } from './reset_password.js';

/** Students family: enrolment, groups, roles, passwords. */
export const STUDENT_TOOLS = [
  listStudentsTool,
  enrolCsvTool,
  unenrolStudentTool,
  createGroupTool,
  assignToGroupTool,
  changeRoleTool,
  resetPasswordTool,
];
