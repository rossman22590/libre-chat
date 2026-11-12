require('dotenv').config();

function isTruthy(value) {
  return value?.trim().toLowerCase() === 'true';
}

function isSentryEnabled() {
  return Boolean(process.env.SENTRY_DSN?.trim()) && !isTruthy(process.env.SENTRY_DISABLED);
}

if (isSentryEnabled()) {
  const { initializeSentry, setupSentryErrorHandler } = require('@librechat/api/sentry');
  const controller = initializeSentry();

  module.exports = {
    get enabled() {
      return controller.enabled;
    },
    get status() {
      return controller.status;
    },
    flush: controller.flush,
    shutdown: controller.shutdown,
    setupSentryErrorHandler,
  };
} else {
  module.exports = {
    enabled: false,
    get status() {
      return 'disabled';
    },
    flush: async () => true,
    shutdown: async () => {},
    setupSentryErrorHandler: () => {},
  };
}
