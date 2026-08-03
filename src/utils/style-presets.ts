/**
 * Italicia visual styles for LessonPlan components.
 *
 * Palette taken from italicia.com (real branding):
 *   - Primary navy: #1e3a8a (blue-900)
 *   - Accent lime: #22c55e (green-500, gradient 74,222,128 → 22,163,74)
 *   - Text ink:    #111827 (gray-900)
 *   - Link blue:   #2563eb (blue-600)
 *   - Font family: Inter + sans-serif fallback
 *
 * Each preset is a CSS string ready to be injected as `style="..."` on the
 * `<div>` that wraps the component content. Uses the official palette and
 * differentiates component types by hue, keeping the left border as a
 * chromatic hint identical to the Boost style of Moodle.
 *
 * If the user passes `custom_style`, that raw CSS wins; otherwise uses
 * `style` as the preset name; if neither, auto-detects from `type`.
 */

export type StylePreset =
  | 'default'
  | 'opening'
  | 'hook'
  | 'dialogue'
  | 'input'
  | 'vocabulary'
  | 'exercise'
  | 'production'
  | 'closing'
  | 'task'
  | 'url'
  | 'video'
  | 'audio';

// Base: Inter + Italicia ink + rounded + coherent padding.
const BASE = "padding:1.25em 1.5em; border-radius:12px; margin:1em 0; font-family:Inter,'Inter Fallback','Segoe UI',sans-serif; color:#111827; line-height:1.65;";

export const STYLE_PRESETS: Record<StylePreset, string> = {
  default:
    `${BASE} background:#f9fafb; border-left:4px solid #1e3a8a;`,
  opening:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #1e3a8a;`,
  hook:
    `${BASE} background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%); border-left:4px solid #22c55e;`,
  dialogue:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
  input:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
  vocabulary:
    `${BASE} background:linear-gradient(135deg,#ede9fe 0%,#ddd6fe 100%); border-left:4px solid #6d28d9;`,
  exercise:
    `${BASE} background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%); border-left:4px solid #d97706;`,
  production:
    `${BASE} background:linear-gradient(135deg,#ffe4e6 0%,#fecdd3 100%); border-left:4px solid #e11d48;`,
  closing:
    `${BASE} background:#f9fafb; border-left:4px solid #1e3a8a;`,
  task:
    `${BASE} background:#f9fafb; border:2px dashed #1e3a8a;`,
  url:
    `${BASE} background:#eff6ff; border-left:4px solid #2563eb;`,
  video:
    `${BASE} background:#fef2f2; border-left:4px solid #dc2626;`,
  audio:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
};

/**
 * Map a raw `component.type` from the lesson YAML to a preset name.
 */
export function typeToPreset(type: string): StylePreset {
  const t = type.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t === 'opening') return 'opening';
  if (t === 'hook' || t === 'image') return 'hook';
  if (t === 'dialogue') return 'dialogue';
  if (t === 'input') return 'input';
  if (t === 'vocabulary') return 'vocabulary';
  if (t.startsWith('exercise')) return 'exercise';
  if (t.startsWith('production')) return 'production';
  if (t === 'closing') return 'closing';
  if (t.startsWith('task')) return 'task';
  if (t === 'url') return 'url';
  if (t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  return 'default';
}

export function resolveStyle(opts: {
  type: string;
  style?: string;
  customStyle?: string;
}): string {
  if (opts.customStyle !== undefined && opts.customStyle.trim() !== '') {
    return opts.customStyle.trim();
  }
  if (opts.style !== undefined && opts.style in STYLE_PRESETS) {
    return STYLE_PRESETS[opts.style as StylePreset];
  }
  return STYLE_PRESETS[typeToPreset(opts.type)];
}

export function wrapWithStyle(html: string, style: string): string {
  const escaped = style.replace(/"/g, '&quot;');
  return `<div style="${escaped}">${html}</div>`;
}

/**
 * Italicia-branded HTML block for the course summary (layer B).
 * Uses the brand palette directly — no preset indirection.
 */
export function renderCourseSummary(opts: {
  title: string;
  subtitle?: string;
  descriptionHtml: string;
}): string {
  const subtitle = opts.subtitle
    ? `<p style="font-size:1.05rem; color:#1e3a8a; margin:0 0 1em 0; font-weight:500;">${opts.subtitle}</p>`
    : '';
  return `
<div style="font-family:Inter,'Inter Fallback','Segoe UI',sans-serif; color:#111827; line-height:1.65; max-width:860px;">
  <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%); color:white; padding:2em 2em 1.75em; border-radius:16px; margin:0 0 1.5em 0;">
    <h2 style="margin:0 0 .25em 0; font-size:1.75rem; font-weight:700; color:white;">${opts.title}</h2>
    <div style="display:inline-block; background:linear-gradient(to right,#4ade80,#16a34a); color:white; padding:.35em .9em; border-radius:999px; font-size:.85rem; font-weight:600; letter-spacing:.02em;">ItalicIA</div>
  </div>
  ${subtitle}
  <div>${opts.descriptionHtml}</div>
</div>`.trim();
}
