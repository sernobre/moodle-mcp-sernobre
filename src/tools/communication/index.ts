import { sendMoodleMessageTool } from './send_moodle_message.js';
import { createForumAnnouncementTool } from './create_forum_announcement.js';
import { createForumTool } from './create_forum.js';
import { getCourseLogsTool } from './get_course_logs.js';
import { getSiteInfoTool } from './get_site_info.js';

/** Communication family: messaging, forums, logs, site info. */
export const COMMUNICATION_TOOLS = [
  sendMoodleMessageTool,
  createForumAnnouncementTool,
  createForumTool,
  getCourseLogsTool,
  getSiteInfoTool,
];
