import { createContext, useContext } from 'react';
import type { SourceBinContextValue } from './types';

export const SourceBinContext = createContext<SourceBinContextValue | null>(null);

export function useSourceBin() {
  const context = useContext(SourceBinContext);

  if (context === null) {
    throw new Error('useSourceBin must be used inside SourceBinProvider');
  }

  return context;
}
