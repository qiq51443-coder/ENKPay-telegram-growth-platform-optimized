import React, { createContext, useContext } from 'react';

interface AuthSyncContextValue {
  /** True once the auth-sync request has settled (resolved or rejected). */
  authSyncDone: boolean;
  /** Current authentication status. */
  authStatus: 'pending' | 'ok' | 'error' | 'expired';
}

export const AuthSyncContext = createContext<AuthSyncContextValue>({
  authSyncDone: false,
  authStatus: 'pending',
});

export function useAuthSync(): AuthSyncContextValue {
  return useContext(AuthSyncContext);
}
