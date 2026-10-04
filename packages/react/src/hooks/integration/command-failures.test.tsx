import { useTimelineHistory, useTimelineSelection } from '#react/hooks';
import { wrapper, createClip, createTrack } from '#react/hooks/integration/testHelpers';
import { TimelineEngine, timelineCommandFail } from '@techsquidtv/canvas-timeline-core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

afterEach(() => vi.restoreAllMocks());

test.each(['undo', 'redo'] as const)(
  '%s normalizes input errors and rethrows other failures',
  (command) => {
    const engine = new TimelineEngine({ tracks: [createTrack('track', [])] });
    engine.renameTrack('track', 'Renamed');
    if (command === 'redo') {
      engine.undo();
    }
    const { result } = renderHook(() => useTimelineHistory(), {
      wrapper: (props) => wrapper({ ...props, engine }),
    });
    const operation = vi.spyOn(engine, command);
    for (const error of [new TypeError('invalid input'), new RangeError('invalid range')]) {
      operation.mockImplementationOnce(() => {
        throw error;
      });
      let outcome: ReturnType<typeof result.current.undo> | undefined;
      act(() => {
        outcome = result.current[command]();
      });
      expect(outcome).toMatchObject({
        ok: false,
        reason: 'invalid-input',
        message: error.message,
        cause: error,
      });
    }
    const unexpected = new Error('unexpected failure');
    operation.mockImplementationOnce(() => {
      throw unexpected;
    });
    expect(() => result.current[command]()).toThrow(unexpected);
  }
);

test.each(['clip', 'track'] as const)(
  'clearSelection returns the first %s failure',
  (failureSource) => {
    const engine = new TimelineEngine({
      tracks: [createTrack('track', [createClip('clip', 0, 2)])],
    });
    engine.selectClip('clip');
    engine.selectTrack('track');
    const { result } = renderHook(() => useTimelineSelection(), {
      wrapper: (props) => wrapper({ ...props, engine }),
    });
    const clip = vi.spyOn(engine, 'selectClip');
    const track = vi.spyOn(engine, 'selectTrack');
    const failure = timelineCommandFail('unsupported', 'Selection unavailable');
    if (failureSource === 'clip') {
      clip.mockReturnValueOnce(failure);
    } else {
      track.mockReturnValueOnce(failure);
    }
    act(() => {
      expect(result.current.clearSelection()).toBe(failure);
    });
    expect(clip).toHaveBeenCalledExactlyOnceWith(null);
    if (failureSource === 'clip') {
      expect(track).not.toHaveBeenCalled();
      expect(result.current.selectedClipId).toBe('clip');
    } else {
      expect(track).toHaveBeenCalledExactlyOnceWith(null);
      expect(result.current.selectedClipId).toBeNull();
    }
    expect(result.current.selectedTrackId).toBe('track');
    act(() => {
      expect(result.current.clearSelection()).toEqual({ ok: true });
    });
    expect(result.current.hasSelection).toBe(false);
  }
);
