const DEFAULT_SERVICE_NAME = 'librechat';
const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

export type SentryStatus = 'disabled' | 'failed' | 'started' | 'stopped';

export interface SentryConfig {
  browserEnabled: boolean;
  debug: boolean;
  dsn?: string;
  enabled: boolean;
  environment: string;
  profileSessionSampleRate: number;
  release?: string;
  sendDefaultPii: boolean;
  serviceName: string;
  tracesSampleRate: number;
}

function isTruthy(value?: string | boolean | null): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function isFalsy(value?: string): boolean {
  return value?.trim().toLowerCase() === 'false';
}

function normalizeEnvValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(normalizeEnvValue(value) ?? '');
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 1);
}

/**
 * Sentry's Node SDK installs its own OpenTelemetry provider. When LibreChat's
 * own OTel tracing is enabled, Sentry performance tracing is forced off so the
 * two do not register competing instrumentation; error reporting is unaffected.
 */
export function getSentryConfig(env: NodeJS.ProcessEnv = process.env): SentryConfig {
  const dsn = normalizeEnvValue(env.SENTRY_DSN);
  const disabled = isTruthy(env.SENTRY_DISABLED);
  const enabled = dsn != null && !disabled;
  const otelActive = isTruthy(env.OTEL_TRACING_ENABLED) && !isTruthy(env.OTEL_SDK_DISABLED);

  return {
    dsn,
    enabled,
    browserEnabled: enabled && !isFalsy(env.SENTRY_BROWSER_ENABLED),
    debug: isTruthy(env.SENTRY_DEBUG),
    environment:
      normalizeEnvValue(env.SENTRY_ENVIRONMENT) ?? normalizeEnvValue(env.NODE_ENV) ?? 'development',
    release: normalizeEnvValue(env.SENTRY_RELEASE) ?? normalizeEnvValue(env.npm_package_version),
    sendDefaultPii: isTruthy(env.SENTRY_SEND_DEFAULT_PII),
    serviceName: normalizeEnvValue(env.SENTRY_SERVICE_NAME) ?? DEFAULT_SERVICE_NAME,
    profileSessionSampleRate: parseSampleRate(env.SENTRY_PROFILE_SESSION_SAMPLE_RATE, 0),
    tracesSampleRate: otelActive
      ? 0
      : parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE),
  };
}
