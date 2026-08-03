import { describe, expect, it } from 'vitest';
import {
  buildAssetFilename,
  mimeForAsset,
  rewriteAssetRefs,
} from '../../../src/tools/content/publish/asset-upload.js';

describe('buildAssetFilename', () => {
  it('keeps the extension from the path, not the asset id', () => {
    expect(buildAssetFilename('img-1', './assets/trigger.PNG')).toBe('img-1.png');
  });

  it('handles paths without an extension', () => {
    expect(buildAssetFilename('aud-1', 'assets/no-extension')).toBe('aud-1');
  });

  it('preserves dots inside the asset id (e.g. uuid-like)', () => {
    expect(buildAssetFilename('aud.u3.c5', './a.mp3')).toBe('aud.u3.c5.mp3');
  });

  it('is stable for idempotent overwrite-by-filename', () => {
    // Same asset_id + same ext => same filename twice in a row.
    const a = buildAssetFilename('img-1', './assets/a.png');
    const b = buildAssetFilename('img-1', './assets/a.png');
    expect(a).toBe(b);
  });
});

describe('mimeForAsset', () => {
  it('resolves common image extensions', () => {
    expect(mimeForAsset('image', './a.png')).toBe('image/png');
    expect(mimeForAsset('image', './a.JPG')).toBe('image/jpeg');
    expect(mimeForAsset('image', './a.jpeg')).toBe('image/jpeg');
    expect(mimeForAsset('image', './a.webp')).toBe('image/webp');
    expect(mimeForAsset('image', './a.svg')).toBe('image/svg+xml');
  });

  it('resolves common audio extensions', () => {
    expect(mimeForAsset('audio_dialog', './a.mp3')).toBe('audio/mpeg');
    expect(mimeForAsset('audio_dialog', './a.m4a')).toBe('audio/mp4');
    expect(mimeForAsset('audio_dialog', './a.wav')).toBe('audio/wav');
  });

  it('falls back to type-based default when extension is missing', () => {
    expect(mimeForAsset('image', 'no-ext')).toBe('image/png');
    expect(mimeForAsset('audio_dialog', 'no-ext')).toBe('audio/mpeg');
    expect(mimeForAsset('video', 'no-ext')).toBe('video/mp4');
  });

  it('falls back to octet-stream for unknown type + unknown extension', () => {
    expect(mimeForAsset('other' as never, 'no-ext')).toBe('application/octet-stream');
  });
});

describe('rewriteAssetRefs', () => {
  it('returns markdown unchanged when the map is empty', () => {
    const md = 'Hello ![](./a.png)';
    expect(rewriteAssetRefs(md, new Map())).toBe(md);
  });

  it('replaces the exact asset_path from the frontmatter', () => {
    const md = '![Fam](./assets/img-1.png)\n<audio src="./assets/aud-1.mp3" />';
    const out = rewriteAssetRefs(
      md,
      new Map([
        ['./assets/img-1.png', 'https://moodle/url/img-1.png'],
        ['./assets/aud-1.mp3', 'https://moodle/url/aud-1.mp3'],
      ]),
    );
    expect(out).toContain('https://moodle/url/img-1.png');
    expect(out).toContain('https://moodle/url/aud-1.mp3');
    expect(out).not.toContain('./assets/img-1.png');
    expect(out).not.toContain('./assets/aud-1.mp3');
  });

  it('also matches the same path written without the leading ./', () => {
    const md = '![](assets/img-1.png)';
    const out = rewriteAssetRefs(
      md,
      new Map([['./assets/img-1.png', 'https://moodle/url/img-1.png']]),
    );
    expect(out).toBe('![](https://moodle/url/img-1.png)');
  });

  it('also matches when the path is stored without ./ but the markdown has it', () => {
    const md = '![](./assets/img-1.png)';
    const out = rewriteAssetRefs(
      md,
      new Map([['assets/img-1.png', 'https://moodle/url/img-1.png']]),
    );
    expect(out).toBe('![](https://moodle/url/img-1.png)');
  });

  it('handles multiple occurrences of the same asset in the same markdown', () => {
    const md = '![](./a.png) and again ![](./a.png)';
    const out = rewriteAssetRefs(md, new Map([['./a.png', 'https://m/a.png']]));
    expect(out).toBe('![](https://m/a.png) and again ![](https://m/a.png)');
  });

  it('does not replace partial matches (a.png should not match ba.png)', () => {
    const md = '![](./ba.png)';
    const out = rewriteAssetRefs(md, new Map([['./a.png', 'https://m/a.png']]));
    // We do a literal `split().join()` so ".ba.png" is a distinct substring
    // that should not be mangled.
    expect(out).toBe('![](./ba.png)');
  });
});
