import { getGradesTool } from './get_grades.js';
import { getCompletionTool } from './get_completion.js';
import { getQuizAttemptsTool } from './get_quiz_attempts.js';
import { getAssignSubmissionsTool } from './get_assign_submissions.js';
import { getAssignmentConfigTool } from './get_assignment_config.js';
import { gradeManuallyTool } from './grade_manually.js';
import { submitAssignmentFileTool } from './submit_assignment_file.js';

/** Gradebook family: grades, completion, attempts, submissions, manual grading and file submission. */
export const GRADEBOOK_TOOLS = [
  getGradesTool,
  getCompletionTool,
  getQuizAttemptsTool,
  getAssignSubmissionsTool,
  getAssignmentConfigTool,
  gradeManuallyTool,
  submitAssignmentFileTool,
];
