import { describe, expect, it } from 'vitest';
import { isVideoFile, studyVideoHref, videoHref } from '../src/ui/studyBlock.js';

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

describe('studyVideoHref', () => {
  const course = { id: 'london-system' };

  it('öffnet Videodateien in der eigenen Video-Ansicht', () => {
    expect(studyVideoHref(course, { id: 'london-system~c0s0', video: '/downloader/downloads/London/01.mp4' })).toBe(
      '#/course/london-system/video/london-system~c0s0',
    );
    expect(isVideoFile('https://example.org/clip.mp4?t=3')).toBe(true);
  });

  it('lässt andere Links (z. B. YouTube) extern', () => {
    expect(isVideoFile('https://youtu.be/abc')).toBe(false);
    expect(studyVideoHref(course, { id: 's', video: 'https://youtu.be/abc' })).toBe('https://youtu.be/abc');
  });
});
