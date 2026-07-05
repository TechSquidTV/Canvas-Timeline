import { useMemo, useRef, useState } from 'react';
import { useTimelineState } from '@techsquidtv/canvas-timeline-react';
import { Download, FileDown, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSourceBin } from '@/components/source-bin/source-bin-context';
import { demoProject } from '@/data/demo-project';
import { formatSeconds } from '@/lib/timeline-format';
import {
  createTimelineExportProfile,
  defaultTimelineExportResolutionId,
  getDefaultExportFilename,
  timelineExportResolutions,
} from '@/export/timeline-export-profile';
import { createTimelineExportPlan } from '@/export/timeline-export-plan';
import type {
  TimelineExportResolutionId,
  TimelineExportStatus,
} from '@/export/timeline-export-types';
import { ToolPanel } from './ToolPanel';

export function ExportToolPanel() {
  const [status, setStatus] = useState<TimelineExportStatus>({ phase: 'idle' });

  return (
    <ToolPanel
      badge={getExportStatusBadge(status)}
      icon={<FileDown aria-hidden="true" />}
      title="Export"
    >
      <ExportPanel status={status} onStatusChange={setStatus} />
    </ToolPanel>
  );
}

function ExportPanel({
  onStatusChange,
  status,
}: {
  onStatusChange: (status: TimelineExportStatus) => void;
  status: TimelineExportStatus;
}) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const state = useTimelineState();
  const { sources } = useSourceBin();
  const [filename, setFilename] = useState(getDefaultExportFilename);
  const [resolutionId, setResolutionId] = useState<TimelineExportResolutionId>(
    defaultTimelineExportResolutionId
  );
  const profile = useMemo(
    () => createTimelineExportProfile({ filename, resolutionId }),
    [filename, resolutionId]
  );
  const planResult = useMemo(
    () => createTimelineExportPlan({ profile, sources, state }),
    [profile, sources, state]
  );
  const disabledReason = planResult.ok ? null : planResult.issues[0]?.message;
  const running = status.phase === 'running';

  async function startExport() {
    if (!planResult.ok || running) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    onStatusChange({ phase: 'running', progress: 0 });

    try {
      const { downloadTimelineExport, runTimelineExport } =
        await import('@/export/mediabunny-timeline-export');
      const blob = await runTimelineExport(planResult.plan, {
        onProgress(progress) {
          onStatusChange({
            phase: 'running',
            progress: getCombinedProgress(progress.phase, progress.progress),
          });
        },
        signal: abortController.signal,
      });

      downloadTimelineExport(blob, planResult.plan.profile.filename);
      onStatusChange({ phase: 'complete' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        onStatusChange({ phase: 'idle' });
        return;
      }

      onStatusChange({
        message: error instanceof Error ? error.message : 'Export failed.',
        phase: 'error',
      });
    } finally {
      abortControllerRef.current = null;
    }
  }

  function cancelExport() {
    abortControllerRef.current?.abort();
  }

  return (
    <div className="export-panel">
      <label className="export-field">
        <span>Filename</span>
        <input
          className="export-input"
          disabled={running}
          onBlur={() => setFilename(profile.filename)}
          onChange={(event) => setFilename(event.currentTarget.value)}
          value={filename}
        />
      </label>

      <label className="export-field">
        <span>Resolution</span>
        <select
          className="export-input"
          disabled={running}
          onChange={(event) =>
            setResolutionId(event.currentTarget.value as TimelineExportResolutionId)
          }
          value={resolutionId}
        >
          {timelineExportResolutions.map((resolution) => (
            <option key={resolution.id} value={resolution.id}>
              {resolution.label}
            </option>
          ))}
        </select>
      </label>

      <dl className="panel-readout export-readout">
        <div>
          <dt>Format</dt>
          <dd>MP4</dd>
        </div>
        <div>
          <dt>Video</dt>
          <dd>H.264</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>AAC</dd>
        </div>
        <div>
          <dt>Frame rate</dt>
          <dd>{demoProject.frameRate} fps</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>
            {planResult.ok ? formatSeconds(planResult.plan.durationSeconds) : 'Timeline content'}
          </dd>
        </div>
      </dl>

      {disabledReason === null ? null : <p className="export-message">{disabledReason}</p>}
      {status.phase === 'error' ? (
        <p className="export-message is-error">{status.message}</p>
      ) : null}
      {status.phase === 'running' ? (
        <div className="export-progress" aria-label="Export progress">
          <span style={{ inlineSize: `${Math.round(status.progress * 100)}%` }} />
        </div>
      ) : null}

      <div className="export-actions">
        {running ? (
          <Button onClick={cancelExport} variant="subtle">
            <Square aria-hidden="true" />
            Cancel
          </Button>
        ) : (
          <Button disabled={!planResult.ok} onClick={() => void startExport()} variant="primary">
            <Download aria-hidden="true" />
            Export MP4
          </Button>
        )}
      </div>
    </div>
  );
}

function getCombinedProgress(phase: 'audio' | 'finalizing' | 'video', progress: number) {
  const boundedProgress = Math.min(1, Math.max(0, progress));

  if (phase === 'video') {
    return boundedProgress * 0.75;
  }

  if (phase === 'audio') {
    return 0.75 + boundedProgress * 0.2;
  }

  return 0.98;
}

function getExportStatusBadge(status: TimelineExportStatus) {
  switch (status.phase) {
    case 'complete':
      return 'Done';
    case 'error':
      return 'Error';
    case 'running':
      return `${Math.round(status.progress * 100)}%`;
    default:
      return undefined;
  }
}
