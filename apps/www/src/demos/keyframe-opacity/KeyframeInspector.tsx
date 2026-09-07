import {
  useTimelineEngine,
  useTimelineKeyframes,
  useTimelineKeyframeGeometry,
} from '@techsquidtv/canvas-timeline-react';
import type {
  TimelineKeyframe,
  TimelineEditPreview,
  TimelineKeyframeClipboard,
  TimelineKeyframeEditCommand,
  TimelineKeyframeSide,
  TimelineReadonly,
} from '@techsquidtv/canvas-timeline-core';
import {
  addRational,
  formatRationalTimecode,
  fromSeconds,
  parseTimecodeToRationalTime,
  toSeconds,
} from '@techsquidtv/canvas-timeline-utils';
import { useEffect, useRef, useState } from 'react';
import { opacityClipId } from '#www/demos/keyframe-opacity/timeline-demo-data';
import {
  createCurvePresetCommand,
  getCurvePresetId,
  keyframeCurvePresets,
} from '#www/demos/keyframe-opacity/keyframe-opacity-utils';

/** App-owned inspector composed from public headless APIs. */
export function KeyframeInspector() {
  const engine = useTimelineEngine();
  const state = useTimelineKeyframes({ clipId: opacityClipId, property: 'opacity' });
  const live = useTimelineKeyframeGeometry({ clipId: opacityClipId, property: 'opacity' });
  const selected = live.keyframeRects.find((entry) => entry.keyframe.selected)?.keyframe;
  const keys = state.keyframes;
  const index = keys.findIndex((key) => key.id === selected?.id);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const clipboard = useRef<TimelineKeyframeClipboard | null>(null);
  const valueEdit = useRef<{
    keyframeId: string | undefined;
    time: TimelineKeyframe['time'];
    preview: TimelineEditPreview | null;
  } | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const value =
    sliderValue ??
    selected?.value ??
    engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity') ??
    1;
  useEffect(
    () => () => {
      if (valueEdit.current?.preview && valueEdit.current.preview === engine.getEditPreview()) {
        engine.cancelEdit();
      }
    },
    [engine]
  );

  const commit = (command: TimelineKeyframeEditCommand) => {
    const result = engine.commitEdit(command);
    setMessage(
      result.committed ? '' : (result.preview.message ?? 'This edit could not be applied.')
    );
    return result;
  };
  const select = (key: TimelineReadonly<TimelineKeyframe> | undefined) => {
    if (!key) {
      return;
    }
    engine.keyframes.selectKeyframes([{ clipId: opacityClipId, keyframeId: key.id }]);
    engine.updatePlayhead(key.time);
  };
  const finishValue = (cancelled = false) => {
    if (!valueEdit.current) {
      return;
    }
    const preview = valueEdit.current.preview;
    if (preview && preview === engine.getEditPreview()) {
      if (!cancelled && preview.valid && preview.command.type === 'keyframes') {
        commit(preview.command);
      }
      engine.cancelEdit();
    }
    valueEdit.current = null;
    setSliderValue(null);
  };
  const editValue = (next: number, preview = false) => {
    if (!Number.isFinite(next)) {
      setMessage('Enter a finite opacity value.');
      return;
    }
    if (valueEdit.current && valueEdit.current.preview !== engine.getEditPreview()) {
      setSliderValue(null);
      setMessage('The value gesture was replaced by another edit.');
      return;
    }
    const target = valueEdit.current ?? {
      keyframeId: selected?.id,
      time: selected?.time ?? engine.getState().playheadTime,
      preview: null,
    };
    const command: TimelineKeyframeEditCommand = {
      type: 'keyframes',
      edits: [
        target.keyframeId
          ? { type: 'update', clipId: opacityClipId, keyframeId: target.keyframeId, value: next }
          : {
              type: 'set',
              clipId: opacityClipId,
              property: 'opacity',
              time: target.time,
              value: next,
              selected: true,
            },
      ],
    };
    if (preview) {
      valueEdit.current = target;
      setSliderValue(next);
      target.preview = engine.previewEdit(command);
    } else {
      commit(command);
    }
  };
  const deleteSelection = () =>
    commit({
      type: 'keyframes',
      edits: state.selectedKeyframes.map((ref) => ({ type: 'remove', ...ref })),
    });
  const paste = (duplicate: boolean) => {
    const copied = duplicate ? engine.keyframes.copyKeyframes() : clipboard.current;
    if (!copied?.entries.length) {
      setMessage('Select and copy some keyframes first.');
      return;
    }
    const time = duplicate
      ? addRational(
          keys.find((key) => key.selected)?.time ?? engine.getState().playheadTime,
          fromSeconds(1 / 30)
        )
      : engine.getState().playheadTime;
    commit(engine.keyframes.createPasteCommand(copied, time));
  };
  const renderCurve = (side: TimelineKeyframeSide) => {
    const left = keys[side === 'incoming' ? index - 1 : index];
    const right = keys[side === 'incoming' ? index : index + 1];
    const preset = left && right ? getCurvePresetId(left, right) : 'none';
    return (
      <label className="keyframe-editor-field">
        {side === 'incoming' ? 'Incoming curve' : 'Outgoing curve'}
        <select
          aria-label={`${side} curve`}
          disabled={!left || !right}
          value={preset}
          onChange={(event) => {
            if (left && right) {
              commit(
                createCurvePresetCommand(opacityClipId, left, right, event.currentTarget.value)
              );
            }
          }}
        >
          <option value="none" disabled>
            No segment
          </option>
          <option value="custom" disabled>
            Custom
          </option>
          {keyframeCurvePresets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <section className="media-sync-panel keyframe-opacity-panel" aria-label="Keyframe inspector">
      <h3>Opacity</h3>
      <p className="media-sync-status">
        {state.selectedKeyframes.length
          ? `${state.selectedKeyframes.length} selected`
          : 'Select a key or set one at the playhead'}
      </p>
      <div className="keyframe-editor-fields">
        <label className="keyframe-editor-field">
          Timecode
          <input
            aria-label="Keyframe timecode"
            key={`${selected?.id}:${selected?.time.v}`}
            disabled={!selected}
            defaultValue={selected ? formatRationalTimecode(selected.time, { frameRate: 30 }) : ''}
            onBlur={(event) => {
              if (!selected) {
                return;
              }
              const time = parseTimecodeToRationalTime(event.currentTarget.value, {
                frameRate: 30,
              });
              if (!time) {
                setMessage('Enter a valid timecode.');
                return;
              }
              if (toSeconds(time) !== toSeconds(selected.time)) {
                commit({
                  type: 'keyframes',
                  edits: [{ type: 'update', clipId: opacityClipId, keyframeId: selected.id, time }],
                });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label className="keyframe-editor-field">
          Value (%)
          <input
            aria-label="Keyframe opacity percent"
            type="number"
            min={0}
            max={100}
            step={0.1}
            key={`${selected?.id}:${selected?.value}`}
            defaultValue={Math.round(value * 10000) / 100}
            onBlur={(event) => {
              const next = Number(event.currentTarget.value) / 100;
              if (next !== value) {
                editValue(next);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      </div>
      <input
        aria-label="Opacity"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={value}
        onChange={(event) => editValue(Number(event.currentTarget.value), true)}
        onPointerUp={() => finishValue()}
        onPointerCancel={() => finishValue(true)}
        onBlur={() => finishValue()}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) {
            finishValue();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finishValue(true);
          }
        }}
      />
      <div className="media-sync-controls">
        <button
          className="media-sync-button"
          disabled={index <= 0}
          onClick={() => select(keys[index - 1])}
        >
          Previous
        </button>
        <button
          className="media-sync-button"
          disabled={index < 0 || index >= keys.length - 1}
          onClick={() => select(keys[index + 1])}
        >
          Next
        </button>
        <button
          className="media-sync-button"
          onClick={() => {
            const time = engine.getState().playheadTime;
            const result = commit({
              type: 'keyframes',
              edits: [
                {
                  type: 'set',
                  clipId: opacityClipId,
                  property: 'opacity',
                  time,
                  value:
                    engine.keyframes.getClipPropertyValueAtTime(opacityClipId, 'opacity', time) ??
                    1,
                  selected: true,
                },
              ],
            });
            if (result.committed) {
              select(
                engine.keyframes
                  .getClipKeyframes(opacityClipId, 'opacity')
                  .find((key) => toSeconds(key.time) === toSeconds(time))
              );
            }
          }}
        >
          Set key
        </button>
        <button
          className="media-sync-button"
          disabled={!state.selectedKeyframes.length}
          onClick={deleteSelection}
        >
          Delete
        </button>
      </div>
      <div className="keyframe-editor-fields">
        {renderCurve('incoming')}
        {renderCurve('outgoing')}
      </div>
      <div className="media-sync-controls">
        <button
          className="media-sync-button"
          disabled={!selected}
          aria-pressed={selected?.tangentMode === 'linked'}
          onClick={() => {
            if (selected) {
              commit({
                type: 'keyframes',
                edits: [
                  {
                    type: 'update',
                    clipId: opacityClipId,
                    keyframeId: selected.id,
                    tangentMode: selected.tangentMode === 'linked' ? 'broken' : 'linked',
                  },
                ],
              });
            }
          }}
        >
          {selected?.tangentMode === 'linked' ? 'Linked tangents' : 'Broken tangents'}
        </button>
        <button
          className="media-sync-button"
          disabled={!selected}
          onClick={() => {
            if (selected) {
              commit({
                type: 'keyframes',
                edits: [
                  {
                    type: 'sides',
                    clipId: opacityClipId,
                    keyframeId: selected.id,
                    incoming: { handle: null },
                    outgoing: { handle: null },
                  },
                ],
              });
            }
          }}
        >
          Reset tangents
        </button>
      </div>
      <div className="media-sync-controls">
        <button
          className="media-sync-button"
          disabled={!state.selectedKeyframes.length}
          onClick={() => {
            clipboard.current = engine.keyframes.copyKeyframes();
            setMessage('Keyframes copied. Paste places them at the playhead.');
          }}
        >
          Copy
        </button>
        <button className="media-sync-button" onClick={() => paste(false)}>
          Paste
        </button>
        <button
          className="media-sync-button"
          disabled={!state.selectedKeyframes.length}
          onClick={() => paste(true)}
        >
          Duplicate
        </button>
        <button className="media-sync-button" onClick={() => engine.undo()}>
          Undo
        </button>
        <button className="media-sync-button" onClick={() => engine.redo()}>
          Redo
        </button>
      </div>
      <button
        className="media-sync-button"
        aria-expanded={expanded}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          engine.setTrackHeight('opacity-video-track', next ? 240 : 64);
        }}
      >
        {expanded ? 'Collapse curve lane' : 'Expand curve lane'}
      </button>
      <p className="media-sync-status">
        Shift-drag empty space to select. Shift locks a drag axis; Alt makes fine adjustments;
        Ctrl/⌘ bypasses snapping. Escape cancels. Arrow keys nudge; [ and ] visit keys.
      </p>
      <p className="media-sync-status" role="status">
        {message}
      </p>
    </section>
  );
}
