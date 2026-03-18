import React, { createContext, useContext } from 'react';

interface AuthSyncContextValue {
  /** True once the auth-sync request has settled (resolved or rejected). */
  authSyncDone: boolean;
}

export const AuthSyncContext = createContext<AuthSyncContextValue>({
  authSyncDone: false,
});

export function useAuthSync(): AuthSyncContextValue {
  return useContext(AuthSyncContext);
}
