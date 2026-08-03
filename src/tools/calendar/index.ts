import { createCalendarEventTool } from './create_calendar_event.js';
import { listCalendarEventsTool } from './list_calendar_events.js';
import { updateEventTool } from './update_event.js';
import { deleteEventTool } from './delete_event.js';

/** Calendar family: create / list / update / delete events. */
export const CALENDAR_TOOLS = [
  createCalendarEventTool,
  listCalendarEventsTool,
  updateEventTool,
  deleteEventTool,
];
