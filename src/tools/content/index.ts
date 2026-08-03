import { publishClassLessonTool } from './publish_class_lesson.js';
import { publishPreviewTool } from './publish_preview.js';
import { confirmPreviewTool } from './confirm_preview.js';
import { generateVideoTool } from './generate_video.js';
import { deleteResourceTool } from './delete_resource.js';

/** Content family: publish / preview / confirm / delete lesson resources. */
export const CONTENT_TOOLS = [
  publishClassLessonTool,
  publishPreviewTool,
  confirmPreviewTool,
  generateVideoTool,
  deleteResourceTool,
];
