import { useEffect } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { initializeSentry } from './client';

export default function useSentry(): void {
  const { data: startupConfig } = useGetStartupConfig();
  const sentryConfig = startupConfig?.sentry;

  useEffect(() => {
    if (!sentryConfig?.dsn) {
      return;
    }
    initializeSentry(sentryConfig);
  }, [sentryConfig]);
}
