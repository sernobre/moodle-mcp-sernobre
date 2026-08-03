import { createSectionTool } from './create_section.js';
import { updateSectionTool } from './update_section.js';
import { hideSectionTool, releaseSectionTool } from './visibility.js';
import { reorderSectionsTool } from './reorder_sections.js';
import { duplicateSectionTool } from './duplicate_section.js';

/** Sections family: create / update / visibility / reorder / duplicate. */
export const SECTIONS_TOOLS = [
  createSectionTool,
  updateSectionTool,
  hideSectionTool,
  releaseSectionTool,
  reorderSectionsTool,
  duplicateSectionTool,
];
