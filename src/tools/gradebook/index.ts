import { getGradesTool } from './get_grades.js';
import { getCompletionTool } from './get_completion.js';
import { getQuizAttemptsTool } from './get_quiz_attempts.js';
import { getAssignSubmissionsTool } from './get_assign_submissions.js';
import { gradeManuallyTool } from './grade_manually.js';

/** Gradebook family: grades, completion, attempts, submissions, manual grading. */
export const GRADEBOOK_TOOLS = [
  getGradesTool,
  getCompletionTool,
  getQuizAttemptsTool,
  getAssignSubmissionsTool,
  gradeManuallyTool,
];
