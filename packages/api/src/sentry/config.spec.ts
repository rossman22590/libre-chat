import { getSentryConfig } from './config';

const DSN = 'https://abc123@o1.ingest.us.sentry.io/42';

describe('getSentryConfig', () => {
  it('is disabled without a DSN', () => {
    const config = getSentryConfig({});
    expect(config.enabled).toBe(false);
    expect(config.dsn).toBeUndefined();
  });

  it('is disabled when the DSN is blank', () => {
    expect(getSentryConfig({ SENTRY_DSN: '   ' }).enabled).toBe(false);
  });

  it('enables once a DSN is present', () => {
    const config = getSentryConfig({ SENTRY_DSN: DSN });
    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe(DSN);
  });

  it('honors the explicit kill switch', () => {
    expect(getSentryConfig({ SENTRY_DSN: DSN, SENTRY_DISABLED: 'true' }).enabled).toBe(false);
    expect(getSentryConfig({ SENTRY_DSN: DSN, SENTRY_DISABLED: 'TRUE' }).enabled).toBe(false);
    expect(getSentryConfig({ SENTRY_DSN: DSN, SENTRY_DISABLED: 'false' }).enabled).toBe(true);
  });

  it('falls back to NODE_ENV for the environment', () => {
    expect(getSentryConfig({ SENTRY_DSN: DSN, NODE_ENV: 'production' }).environment).toBe(
      'production',
    );
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging' })
        .environment,
    ).toBe('staging');
    expect(getSentryConfig({ SENTRY_DSN: DSN }).environment).toBe('development');
  });

  it('clamps the traces sample rate into 0..1', () => {
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '2' }).tracesSampleRate,
    ).toBe(1);
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '-1' }).tracesSampleRate,
    ).toBe(0);
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '0.25' }).tracesSampleRate,
    ).toBe(0.25);
  });

  it('falls back to the default sample rate for unparseable values', () => {
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: 'nonsense' }).tracesSampleRate,
    ).toBe(0.1);
  });

  it('forces tracing off while OpenTelemetry tracing is active', () => {
    const config = getSentryConfig({
      SENTRY_DSN: DSN,
      OTEL_TRACING_ENABLED: 'true',
      SENTRY_TRACES_SAMPLE_RATE: '1',
    });
    expect(config.tracesSampleRate).toBe(0);
    expect(config.enabled).toBe(true);
  });

  it('keeps tracing when the OpenTelemetry SDK is disabled', () => {
    const config = getSentryConfig({
      SENTRY_DSN: DSN,
      OTEL_TRACING_ENABLED: 'true',
      OTEL_SDK_DISABLED: 'true',
      SENTRY_TRACES_SAMPLE_RATE: '1',
    });
    expect(config.tracesSampleRate).toBe(1);
  });

  it('enables the browser SDK alongside the backend unless opted out', () => {
    expect(getSentryConfig({}).browserEnabled).toBe(false);
    expect(getSentryConfig({ SENTRY_DSN: DSN }).browserEnabled).toBe(true);
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_BROWSER_ENABLED: 'false' }).browserEnabled,
    ).toBe(false);
    expect(getSentryConfig({ SENTRY_DSN: DSN, SENTRY_DISABLED: 'true' }).browserEnabled).toBe(
      false,
    );
  });

  it('keeps PII collection off unless opted in', () => {
    expect(getSentryConfig({ SENTRY_DSN: DSN }).sendDefaultPii).toBe(false);
    expect(
      getSentryConfig({ SENTRY_DSN: DSN, SENTRY_SEND_DEFAULT_PII: 'true' }).sendDefaultPii,
    ).toBe(true);
  });
});
