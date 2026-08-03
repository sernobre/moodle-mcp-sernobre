import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { LessonPlanSchema, type Component } from '../../schemas/lesson-plan.js';
import { planLesson } from '../../adapters/lesson-to-moodle.js';
import { extractComponentBodies } from './publish/lesson-bodies.js';
import { executePlan } from './publish/executor.js';
import type { ExecuteContext } from './publish/types.js';

const InputSchema = z
  .object({
    lesson_path: z
      .string()
      .min(1)
      .refine((p) => isAbsolute(p), {
        message: 'lesson_path must be an absolute path',
      }),
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive().optional(),
    mode: z.enum(['visible', 'hidden']).default('hidden'),
  })
  .strict();

export type PublishLessonPlanInput = z.infer<typeof InputSchema>;

/**
 * Publish a LessonPlan markdown file as a Moodle course section plus its
 * component modules. Default mode is `hidden` (hidden/preview) so Alice
 * can review before releasing to students (CONTEXT §1.2, §16).
 *
 * v0.1 scope: the `local_sernobre_mcp` plugin on the Moodle server drives
 * the whole flow — it creates/updates modules by stable `idnumber`
 * (`upsert_page`/`upsert_url`/`upsert_assignment`/`upsert_forum`/`upsert_quiz`)
 * and manages sections (`create_section`/`update_section`). When a module
 * upsert fails, we surface a `warning` with `status: "missing"` and carry
 * on, so a partially-deployed plugin degrades gracefully instead of
 * aborting the publish.
 */
export function buildPublishClassLessonTool(): ToolDefinition<PublishLessonPlanInput> {
  return {
    name: 'publish_class_lesson',
    description:
      'Publish a LessonPlan markdown file as a Moodle section with component modules. Idempotent: republishing the same lesson updates in place, never duplicates. Default mode is `hidden`. Use `publish_preview` + `confirm_preview` for the preview workflow.',
    inputSchema: InputSchema,
    handler: (args, ctx) => executePublishLessonPlan(args, ctx),
  };
}

export const publishClassLessonTool = buildPublishClassLessonTool();

async function executePublishLessonPlan(
  args: PublishLessonPlanInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const raw = await readFile(args.lesson_path, 'utf8');
    const parsed = matter(raw);
    const lesson = LessonPlanSchema.parse(parsed.data);

    const componentContent = extractComponentBodies(parsed.content);
    const visible = args.mode === 'visible';
    const plan = planLesson({ lesson, visible, componentContent });

    const componentsById = new Map<string, Component>(
      lesson.components.map((c) => [c.id, c]),
    );
    const exec: ExecuteContext = {
      courseId: args.course_id,
      sectionIdOverride: args.section_id,
      lessonDir: dirname(args.lesson_path),
    };
    const result = await executePlan(ctx, plan, exec, componentsById);

    return toJsonResponse(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
