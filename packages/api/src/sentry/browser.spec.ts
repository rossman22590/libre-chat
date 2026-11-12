import { getSentryBrowserConfig } from './browser';

const DSN = 'https://abc123@o1.ingest.us.sentry.io/42';

describe('getSentryBrowserConfig', () => {
  it('is undefined without a DSN', () => {
    expect(getSentryBrowserConfig({})).toBeUndefined();
  });

  it('is undefined when Sentry is disabled', () => {
    expect(getSentryBrowserConfig({ SENTRY_DSN: DSN, SENTRY_DISABLED: 'true' })).toBeUndefined();
  });

  it('is undefined when the browser SDK is opted out', () => {
    expect(
      getSentryBrowserConfig({ SENTRY_DSN: DSN, SENTRY_BROWSER_ENABLED: 'false' }),
    ).toBeUndefined();
  });

  it('exposes only the DSN, environment and release', () => {
    expect(
      getSentryBrowserConfig({
        SENTRY_DSN: DSN,
        NODE_ENV: 'production',
        SENTRY_RELEASE: 'v1.2.3',
        SENTRY_SEND_DEFAULT_PII: 'true',
      }),
    ).toEqual({ dsn: DSN, environment: 'production', release: 'v1.2.3' });
  });

  it('omits the release when none is known', () => {
    expect(getSentryBrowserConfig({ SENTRY_DSN: DSN })).toEqual({
      dsn: DSN,
      environment: 'development',
    });
  });
});
