import { captureException, initializeSentry, resetSentryForTests } from './client';

const mockInit = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@sentry/browser', () => ({
  __esModule: true,
  init: (...args: object[]) => mockInit(...args),
  captureException: (...args: object[]) => mockCaptureException(...args),
}));

const config = {
  dsn: 'https://abc123@o1.ingest.us.sentry.io/42',
  environment: 'production',
  release: 'v1.2.3',
};

describe('sentry client', () => {
  beforeEach(() => {
    resetSentryForTests();
    mockInit.mockReset();
    mockCaptureException.mockReset();
  });

  it('starts the SDK with the startup config', async () => {
    await initializeSentry(config);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0][0]).toMatchObject({
      dsn: config.dsn,
      release: 'v1.2.3',
      environment: 'production',
    });
  });

  it('starts only once', async () => {
    await Promise.all([initializeSentry(config), initializeSentry(config)]);
    await initializeSentry(config);

    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('keeps PII collection, tracing and replay off', async () => {
    await initializeSentry(config);
    const options = mockInit.mock.calls[0][0];

    expect(options.dataCollection).toMatchObject({
      cookies: false,
      httpBodies: [],
      httpHeaders: false,
      urlQueryParams: false,
      userInfo: false,
    });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.replaysSessionSampleRate).toBeUndefined();
    expect(options.replaysOnErrorSampleRate).toBeUndefined();
  });

  it('drops the console breadcrumb integration', async () => {
    await initializeSentry(config);
    const { integrations } = mockInit.mock.calls[0][0];

    expect(
      integrations([{ name: 'Console' }, { name: 'GlobalHandlers' }, { name: 'Breadcrumbs' }]),
    ).toEqual([{ name: 'GlobalHandlers' }, { name: 'Breadcrumbs' }]);
  });

  it('ignores captures before the SDK is requested', () => {
    captureException(new Error('early'));

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('delivers captures made while the SDK is loading', async () => {
    const error = new Error('during load');
    const started = initializeSentry(config);
    captureException(error);
    await started;
    await Promise.resolve();

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('captures directly once started', async () => {
    const error = new Error('boom');
    await initializeSentry(config);
    captureException(error);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });
});
