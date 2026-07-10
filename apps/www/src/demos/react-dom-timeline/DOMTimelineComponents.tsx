import { useTimelineRulerTicks, useTimelineViewport } from '@techsquidtv/canvas-timeline-react';
import type {
  TimelineRulerFormatOptions,
  VisibleTimelineClip,
} from '@techsquidtv/canvas-timeline-core';

interface RulerDOMProps {
  ruler: TimelineRulerFormatOptions;
  showLabels?: boolean;
}

/**
 * Renders the timeline ruler using absolute-positioned React DOM nodes.
 */
export function RulerDOM({ ruler, showLabels = true }: RulerDOMProps) {
  const { viewportWidth } = useTimelineViewport();
  const ticks = useTimelineRulerTicks({
    ...ruler,
    includeLabels: showLabels,
    minimumMajorTickSpacing: ruler.format === 'timecode' ? 96 : undefined,
  });
  const labelInset = ruler.format === 'timecode' ? 48 : 24;

  return (
    <div className="timeline-dom-ruler">
      {ticks.map((tick) => {
        const labelX = Math.min(
          Math.max(tick.x, labelInset),
          Math.max(labelInset, viewportWidth - labelInset)
        );

        return (
          <div
            key={tick.frame ?? tick.seconds}
            className={`timeline-dom-ruler-tick timeline-dom-ruler-tick-${tick.kind}`}
            style={{
              position: 'absolute',
              left: `${tick.x}px`,
            }}
          >
            {tick.label && (
              <span style={{ transform: `translateX(${labelX - tick.x}px)` }}>{tick.label}</span>
            )}
            <div className="timeline-dom-ruler-tick-mark" />
          </div>
        );
      })}
    </div>
  );
}

interface DOMClipProps {
  clip: VisibleTimelineClip;
  showLabels?: boolean;
}

/**
 * Renders a single clip as an absolute-positioned DOM element.
 */
export function DOMClip({ clip, showLabels = true }: DOMClipProps) {
  return (
    <div
      className={`timeline-dom-clip ${clip.clip.selected ? 'is-selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${clip.visibleRect.x}px`,
        width: `${clip.visibleRect.width}px`,
        background: clip.clip.color,
      }}
    >
      {showLabels && <span className="timeline-dom-clip-label">{clip.clip.label}</span>}
    </div>
  );
}
