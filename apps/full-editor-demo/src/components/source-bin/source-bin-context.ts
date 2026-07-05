import { createContext, useContext } from 'react';
import type { SourceBinContextValue, SourceBinMediaContextValue } from './types';

export const SourceBinContext = createContext<SourceBinContextValue | null>(null);
export const SourceBinMediaContext = createContext<SourceBinMediaContextValue | null>(null);

export function useSourceBin() {
  const context = useContext(SourceBinContext);

  if (context === null) {
    throw new Error('useSourceBin must be used inside SourceBinProvider');
  }

  return context;
}

export function useSourceBinMedia() {
  const context = useContext(SourceBinMediaContext);

  if (context === null) {
    throw new Error('useSourceBinMedia must be used inside SourceBinProvider');
  }

  return context;
}
