import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, Express } from 'express';
import type { SentryConfig, SentryStatus } from './config';
import { registerShutdownTask } from '../app/shutdown';
import { getSentryConfig } from './config';

export interface SentryController {
  readonly enabled: boolean;
  readonly status: SentryStatus;
  flush: (timeoutMs?: number) => Promise<boolean>;
  shutdown: () => Promise<void>;
}

const WARNING_CODE = 'LIBRECHAT_SENTRY';
const FLUSH_TIMEOUT_MS = 2_000;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;

let status: SentryStatus = 'stopped';
let shutdownTaskRegistered = false;

/**
 * Sentry v11 collects user info, cookies, headers, query params and HTTP bodies
 * by default. For LibreChat those bodies are user prompts and the headers carry
 * auth tokens, so collection is switched off unless an operator opts in via
 * SENTRY_SEND_DEFAULT_PII, in which case the SDK defaults apply.
 */
const PII_FREE_DATA_COLLECTION: Sentry.NodeOptions['dataCollection'] = {
  cookies: false,
  httpBodies: [],
  httpHeaders: false,
  queues: false,
  urlQueryParams: false,
  userInfo: false,
  databaseQueryData: false,
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
};

function buildOptions(config: SentryConfig): Sentry.NodeOptions {
  return {
    dsn: config.dsn,
    debug: config.debug,
    release: config.release,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate,
    profileSessionSampleRate: config.profileSessionSampleRate,
    initialScope: { tags: { service: config.serviceName } },
    dataCollection: config.sendDefaultPii ? undefined : PII_FREE_DATA_COLLECTION,
  };
}

function registerFlushOnShutdown(): void {
  if (shutdownTaskRegistered) {
    return;
  }
  shutdownTaskRegistered = true;
  registerShutdownTask('sentry', async () => {
    await Sentry.flush(SHUTDOWN_FLUSH_TIMEOUT_MS);
    status = 'stopped';
  });
}

function createController(): SentryController {
  return {
    get enabled() {
      return status === 'started';
    },
    get status() {
      return status;
    },
    flush: (timeoutMs = FLUSH_TIMEOUT_MS) => Sentry.flush(timeoutMs),
    shutdown: async () => {
      if (status !== 'started') {
        return;
      }
      await Sentry.flush(SHUTDOWN_FLUSH_TIMEOUT_MS);
      status = 'stopped';
    },
  };
}

/**
 * Initializes the Sentry Node SDK. Must run before the modules Sentry
 * auto-instruments (http, express, mongo) are required, so the caller is the
 * process entrypoint rather than a lazily-loaded module.
 */
export function initializeSentry(env: NodeJS.ProcessEnv = process.env): SentryController {
  const config = getSentryConfig(env);

  if (!config.enabled) {
    status = 'disabled';
    return createController();
  }

  try {
    Sentry.init(buildOptions(config));
    status = 'started';
    registerFlushOnShutdown();
  } catch (error) {
    status = 'failed';
    const reason = error instanceof Error ? error.message : String(error);
    process.emitWarning(`Sentry failed to initialize: ${reason}`, { code: WARNING_CODE });
  }

  return createController();
}

/** Attaches Sentry's Express error handler; a no-op when the SDK is not running. */
export function setupSentryErrorHandler(app: Express): void {
  if (status !== 'started') {
    return;
  }
  Sentry.setupExpressErrorHandler(app);
}

export function sentryErrorMiddleware(): ErrorRequestHandler {
  return (err, _req, _res, next) => {
    if (status === 'started') {
      Sentry.captureException(err);
    }
    next(err);
  };
}

export function getSentryStatus(): SentryStatus {
  return status;
}
