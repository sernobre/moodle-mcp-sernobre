import { z } from 'zod';
import { isAbsolute } from 'node:path';
import {
  toErrorResponse,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import {
  publishClassLessonTool,
  type PublishLessonPlanInput,
} from './publish_class_lesson.js';

const InputSchema = z
  .object({
    lesson_path: z
      .string()
      .min(1)
      .refine((p) => isAbsolute(p), {
        message: 'lesson_path must be an absolute path',
      }),
    course_id: z.number().int().positive(),
  })
  .strict();

export type PublishPreviewInput = z.infer<typeof InputSchema>;

/**
 * Publish a LessonPlan in hidden/preview mode and return a URL Alice can
 * open in a browser to review before calling `confirm_preview`.
 *
 * Internally this is `publish_class_lesson` with `mode: "hidden"` and an
 * extra `preview_url` field on the response.
 */
export const publishPreviewTool: ToolDefinition<PublishPreviewInput> = {
  name: 'publish_preview',
  description:
    'Publish a LessonPlan in hidden preview mode. Returns the same shape as publish_class_lesson plus `preview_url` the teacher can open to review. Students will not see anything until `confirm_preview` is called.',
  inputSchema: InputSchema,
  async handler(args, ctx): Promise<ToolResponse> {
    const delegateInput: PublishLessonPlanInput = {
      lesson_path: args.lesson_path,
      course_id: args.course_id,
      mode: 'hidden',
    };
    const res = await publishClassLessonTool.handler(delegateInput, ctx);
    if (res.isError) return res;

    try {
      const parsed = JSON.parse(res.content[0]!.text) as {
        section?: { id?: unknown; [k: string]: unknown };
        [k: string]: unknown;
      };
      const baseUrl = deriveBaseUrl(ctx);
      const sectionId = parsed.section?.id;
      const hasValidSectionId = typeof sectionId === 'number' && Number.isFinite(sectionId);
      const previewUrl =
        baseUrl !== '' && hasValidSectionId
          ? `${baseUrl}/course/view.php?id=${args.course_id}#section-${sectionId}`
          : undefined;
      const augmented: Record<string, unknown> = { ...parsed, preview_url: previewUrl };
      if (!previewUrl) {
        augmented.warnings = [
          ...((parsed.warnings as string[]) ?? []),
          'preview_url could not be constructed (missing baseUrl or section id).',
        ];
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(augmented) }],
      };
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};

/**
 * Pull the Moodle base URL from the client; falls back to a placeholder if
 * the context does not carry one (unit tests, typically).
 */
function deriveBaseUrl(ctx: { client: unknown }): string {
  const client = ctx.client as { baseUrl?: string };
  return client.baseUrl ?? '';
}
