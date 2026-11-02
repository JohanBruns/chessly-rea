import { describe, expect, it } from 'vitest';
import { videoHref } from '../src/ui/studyBlock.js';

describe('videoHref', () => {
  it('lässt vollständige URLs unverändert', () => {
    expect(videoHref('https://vimeo.com/123?x=1&y=2')).toBe('https://vimeo.com/123?x=1&y=2');
  });

  it('codiert lokale Pfade mit Leerzeichen, & und #', () => {
    expect(videoHref("/downloader/downloads/The London System/07-01 Nimzo & Queen's #1.mp4")).toBe(
      "/downloader/downloads/The%20London%20System/07-01%20Nimzo%20&%20Queen's%20%231.mp4",
    );
  });
});
