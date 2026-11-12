import type { TSentryConfig } from 'librechat-data-provider';
import { getSentryConfig } from './config';

/**
 * Sentry settings handed to the browser through the startup config. A DSN is
 * public by design, so exposing it pre-login is safe. Kept free of
 * `@sentry/node` so the main bundle can export it without loading the SDK.
 */
export function getSentryBrowserConfig(
  env: NodeJS.ProcessEnv = process.env,
): TSentryConfig | undefined {
  const config = getSentryConfig(env);
  if (!config.browserEnabled || config.dsn == null) {
    return undefined;
  }

  return {
    dsn: config.dsn,
    environment: config.environment,
    ...(config.release ? { release: config.release } : {}),
  };
}
