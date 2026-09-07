import type { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { createContext } from 'react';
/** Stable engine context. State subscriptions live in the consuming hooks. */
export const TimelineContext = createContext<TimelineEngine | null>(null);
