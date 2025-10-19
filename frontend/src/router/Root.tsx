
import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import ErrorPage from '@/components/ui/ErrorPage';

/**
 *
 */
export default function Root() {
  const { ipBlockedInfo } = useAppContext();

  if (ipBlockedInfo) {
    return (
      <ErrorPage 
        status={451}
        title={ipBlockedInfo.title}
        message={ipBlockedInfo.message}
        actions={ipBlockedInfo.actions}
      />
    );
  }

  return <Outlet />;
}
