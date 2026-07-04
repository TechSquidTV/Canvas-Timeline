export interface TimelineScalarControlState {
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  valueText: string;
}

export interface TimelineScalarControlPropsOptions {
  control: TimelineScalarControlState;
  setValue: (value: number) => void;
  commit: (value?: number) => void;
  getAriaValueText: (value: number) => string;
  onValueCommitted?: (value: number[], eventDetails?: unknown) => void;
  onEmptyCommit?: () => void;
}

export function createTimelineScalarControlProps({
  commit,
  control,
  getAriaValueText,
  onEmptyCommit,
  onValueCommitted,
  setValue,
}: TimelineScalarControlPropsOptions) {
  return {
    getAriaValueText,
    rootProps: {
      min: control.min,
      max: control.max,
      step: control.step,
      value: [control.value],
      onValueChange: (values: number[]) => {
        if (values[0] !== undefined) {
          setValue(values[0]);
        }
      },
      onValueCommitted: (values: number[], eventDetails?: unknown) => {
        if (values[0] !== undefined) {
          commit(values[0]);
        } else {
          onEmptyCommit?.();
        }
        onValueCommitted?.(values, eventDetails);
      },
    },
    thumbProps: {
      'aria-label': control.label,
      'aria-valuetext': control.valueText,
    },
  };
}
