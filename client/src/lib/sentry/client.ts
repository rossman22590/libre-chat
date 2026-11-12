import type { TSentryConfig } from 'librechat-data-provider';

type SentryBrowser = typeof import('@sentry/browser');
type BrowserOptions = NonNullable<Parameters<SentryBrowser['init']>[0]>;
type CapturedError = Parameters<SentryBrowser['captureException']>[0];

const SERVICE_NAME = 'librechat-web';

/** Console breadcrumbs can carry prompts and responses the app logs, so they stay out. */
const EXCLUDED_INTEGRATIONS = new Set(['Console']);

/**
 * Sentry v11 collects user info, cookies, headers, query params and HTTP bodies
 * by default. Chat content travels in those bodies, so collection is off.
 */
const PII_FREE_DATA_COLLECTION: BrowserOptions['dataCollection'] = {
  cookies: false,
  httpBodies: [],
  httpHeaders: false,
  urlQueryParams: false,
  userInfo: false,
  genAI: { inputs: false, outputs: false },
};

let sdk: SentryBrowser | undefined;
let pending: Promise<void> | undefined;

async function start(config: TSentryConfig): Promise<void> {
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn: config.dsn,
    release: config.release,
    environment: config.environment,
    dataCollection: PII_FREE_DATA_COLLECTION,
    initialScope: { tags: { service: SERVICE_NAME } },
    integrations: (defaults) =>
      defaults.filter((integration) => !EXCLUDED_INTEGRATIONS.has(integration.name)),
  });
  sdk = Sentry;
}

/** Loads and starts the browser SDK once; error reporting only, no tracing or replay. */
export function initializeSentry(config: TSentryConfig): Promise<void> {
  pending ??= start(config).catch(() => {
    pending = undefined;
  });
  return pending;
}

export function captureException(error: CapturedError): void {
  if (sdk) {
    sdk.captureException(error);
    return;
  }
  pending?.then(() => sdk?.captureException(error));
}

export function resetSentryForTests(): void {
  sdk = undefined;
  pending = undefined;
}
