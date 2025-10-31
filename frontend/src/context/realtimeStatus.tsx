"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

type RealtimeStatusContextValue = {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
};

const RealtimeStatusContext = createContext<RealtimeStatusContextValue | undefined>(undefined);

type RealtimeStatusProviderProps = {
  children: ReactNode;
};

export const RealtimeStatusProvider = ({ children }: RealtimeStatusProviderProps) => {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const value = useMemo<RealtimeStatusContextValue>(() => ({ status, setStatus }), [status]);

  return <RealtimeStatusContext.Provider value={value}>{children}</RealtimeStatusContext.Provider>;
};

export const useRealtimeStatus = (): RealtimeStatus => {
  const context = useContext(RealtimeStatusContext);
  if (!context) {
    throw new Error('useRealtimeStatus must be used within a RealtimeStatusProvider');
  }
  return context.status;
};

export const useRealtimeStatusSetter = (): RealtimeStatusContextValue['setStatus'] => {
  const context = useContext(RealtimeStatusContext);
  if (!context) {
    throw new Error('useRealtimeStatusSetter must be used within a RealtimeStatusProvider');
  }
  return context.setStatus;
};
