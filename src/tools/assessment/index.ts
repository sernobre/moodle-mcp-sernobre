import { configureQuizTool } from './configure_quiz.js';
import { importGiftTool } from './import_gift.js';
import { modifyQuestionTool } from './modify_question.js';
import { publishExamLessonTool } from './publish_exam_lesson.js';
import { getQuizQuestionsTool } from './get_quiz_questions.js';
import { createQuizTool, updateQuizTool } from './quiz-crud.js';

/** Assessment family: quizzes, GIFT import, question editing. */
export const ASSESSMENT_TOOLS = [
  configureQuizTool,
  importGiftTool,
  modifyQuestionTool,
  publishExamLessonTool,
  getQuizQuestionsTool,
];
