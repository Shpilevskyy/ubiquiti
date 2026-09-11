import { useSyncExternalStore } from 'react';
import { connectionStatus } from '../lib/connectionStatus';

export function useConnectionStatus() {
  return useSyncExternalStore(connectionStatus.subscribe, connectionStatus.getStatus);
}
