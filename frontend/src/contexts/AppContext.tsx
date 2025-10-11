
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

/**
 *
 */
export interface IpBlockedError {
  code: 'IP_BLOCKED';
  title: string;
  message: string;
  actions: Array<{
    type: 'unlock_code' | 'appeal';
    label: string;
    endpoint: string;
    method: 'POST';
    fields: Array<{
      name: string;
      type: 'text' | 'email' | 'textarea';
      label: string;
    }>;
  }>;
}

interface AppContextType {
  ipBlockedInfo: IpBlockedError | null;
  setIpBlockedInfo: (info: IpBlockedError | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 *
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [ipBlockedInfo, setIpBlockedInfo] = useState<IpBlockedError | null>(null);

  useEffect(() => {
    const handleIpBlocked = (event: CustomEvent<IpBlockedError>) => {
      setIpBlockedInfo(event.detail);
    };

    window.addEventListener('ip-blocked', handleIpBlocked as EventListener);

    return () => {
      window.removeEventListener('ip-blocked', handleIpBlocked as EventListener);
    };
  }, []);

  return (
    <AppContext.Provider value={{ ipBlockedInfo, setIpBlockedInfo }}>
      {children}
    </AppContext.Provider>
  );
}

/**
 *
 */
export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
