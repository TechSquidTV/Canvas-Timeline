import type { RationalTime } from '@techsquidtv/canvas-timeline-utils';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';

export function formatSeconds(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return 'Pending';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
}

export function formatRationalTime(time: RationalTime | undefined) {
  return time === undefined ? 'Dynamic' : formatSeconds(toSeconds(time));
}
