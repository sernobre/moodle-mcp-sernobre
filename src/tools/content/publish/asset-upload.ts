import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { AssetType } from '../../../schemas/lesson-plan.js';
import type { Plan } from '../../../adapters/lesson-to-moodle.js';
import type { ToolContext } from '../../types.js';

/**
 * Upload helpers for the `publish_class_lesson` pipeline. Each upload_asset
 * op reads the local file, base64-encodes it, calls the companion plugin's
 * `local_sernobre_mcp_upload_file`, and captures the resulting pluginfile
 * URL so upsert_page ops can rewrite their markdown asset refs
 * (`./assets/foo.png`) to the real Moodle URL.
 */

interface UploadFileResponse {
  url: string;
  filename: string;
  filesize: number;
  contextid: number;
}

export async function executeUploadAsset(
  ctx: ToolContext,
  op: Extract<Plan['operations'][number], { kind: 'upload_asset' }>,
  lessonDir: string,
  courseId: number,
): Promise<{ asset_id: string; url: string } | null> {
  try {
    const absPath = isAbsolute(op.asset_path) ? op.asset_path : join(lessonDir, op.asset_path);
    const buffer = await readFile(absPath);
    const filename = buildAssetFilename(op.asset_id, op.asset_path);
    const mimetype = mimeForAsset(op.asset_type, op.asset_path);
    const b64 = buffer.toString('base64');

    const result = (await ctx.client.call('local_sernobre_mcp_upload_file', {
      courseid: courseId,
      filename,
      filecontent_b64: b64,
      mimetype,
    })) as UploadFileResponse;

    return { asset_id: op.asset_id, url: result.url };
  } catch (e) {
    ctx.logger.warn('upload_asset.failed', {
      asset_id: op.asset_id,
      asset_path: op.asset_path,
      error: (e as Error).message,
    });
    return null;
  }
}

/**
 * Deterministic filename for the Moodle file storage. The companion
 * plugin overwrites in place when the same filename is uploaded twice,
 * so tying the filename to the stable `asset_id` keeps republishing
 * idempotent.
 */
export function buildAssetFilename(assetId: string, assetPath: string): string {
  const ext = assetPath.match(/\.[^./\\]+$/)?.[0].toLowerCase() ?? '';
  return `${assetId}${ext}`;
}

/**
 * Best-effort MIME type from the asset file extension. Falls back to
 * `asset_type`-based defaults for rare cases (Gemini sometimes returns
 * files without an explicit extension).
 */
export function mimeForAsset(type: AssetType, path: string): string {
  const ext = path.match(/\.[^./\\]+$/)?.[0]?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text',
  };
  if (byExt[ext]) return byExt[ext];
  // Fallback by asset_type when extension is missing or unknown.
  switch (type) {
    case 'image':
      return 'image/png';
    case 'audio':
    case 'audio_dialog':
      return 'audio/mpeg';
    case 'video':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Replace local asset references (e.g. `./assets/img-1.png`) inside
 * markdown with the pluginfile URL returned by Moodle.
 *
 * Matches both the exact `assetPath` from the lesson frontmatter and its
 * alternate form (with/without leading `./`) so we tolerate authors who
 * are inconsistent between frontmatter and markdown body. For the short
 * alternate we require a non-word boundary character before the match,
 * so e.g. `./a.png` in the map does not mangle a `./ba.png` in the body.
 */
export function rewriteAssetRefs(
  markdown: string,
  assetPathToUrl: Map<string, string>,
): string {
  if (assetPathToUrl.size === 0) return markdown;
  let result = markdown;
  for (const [assetPath, url] of assetPathToUrl) {
    const normalized = assetPath.replace(/^\.\//, '');
    const exactPath = assetPath;
    const altPath = assetPath.startsWith('./') ? normalized : `./${normalized}`;

    const [longer, shorter] =
      exactPath.length >= altPath.length ? [exactPath, altPath] : [altPath, exactPath];

    // 1. Replace the fully-qualified form with a plain split/join — safe
    // because paths starting with `./` cannot be a suffix of another
    // longer path (the leading `.` acts as its own boundary).
    result = result.split(longer).join(url);

    // 2. For the short alternate, only replace when preceded by a
    // non-word boundary (start-of-string, whitespace, or common markdown
    // delimiters like `(`, `[`, `"`, `'`). Word chars and `.`/`/` are
    // excluded so `a.png` in the map never matches inside `ba.png` or
    // `path/a.png`.
    if (longer !== shorter) {
      const escaped = escapeRegExp(shorter);
      const re = new RegExp(`(^|[^./\\w-])${escaped}`, 'g');
      result = result.replace(re, `$1${url}`);
    }
  }
  return result;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
