'use client';
import { useSyncExternalStore } from 'react';
import { analysisStore } from './analysisStore';

const DEFAULT_SERVER = {
  status: 'idle', loadingStep: '', posts: [], gscData: [], ga4Data: [],
  analysis: null, error: '', gscError: '', cacheInfo: null,
};

/** Subscribe to a single site's analysis state */
export function useAnalysisStore(siteId) {
  return useSyncExternalStore(
    analysisStore.subscribe.bind(analysisStore),
    () => analysisStore.getState(siteId),
    () => DEFAULT_SERVER,
  );
}

/** Subscribe to all sites that have non-idle state (for dashboard) */
export function useAllAnalysisStates() {
  return useSyncExternalStore(
    analysisStore.subscribe.bind(analysisStore),
    () => analysisStore.getActiveStates(),
    () => ({}),
  );
}
