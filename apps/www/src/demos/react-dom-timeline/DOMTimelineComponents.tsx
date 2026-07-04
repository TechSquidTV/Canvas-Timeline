import { useTimelineRulerTicks } from '@techsquidtv/canvas-timeline-react';
import type { VisibleTimelineClip } from '@techsquidtv/canvas-timeline-core';

interface RulerDOMProps {
  showLabels?: boolean;
}

/**
 * Renders the timeline ruler using absolute-positioned React DOM nodes.
 */
export function RulerDOM({ showLabels = true }: RulerDOMProps) {
  const ticks = useTimelineRulerTicks({ includeLabels: showLabels });

  return (
    <div className="timeline-dom-ruler">
      {ticks.map((tick) => {
        return (
          <div
            key={tick.frame ?? tick.seconds}
            className="timeline-dom-ruler-tick"
            style={{
              position: 'absolute',
              left: `${tick.x}px`,
            }}
          >
            {tick.label && <span>{tick.label}</span>}
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
