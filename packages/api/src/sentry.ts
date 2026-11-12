/**
 * Build entry shim for the `@librechat/api/sentry` subpath export.
 * Re-exports the sentry barrel under a unique basename so the bundler emits
 * stable `dist/sentry.*` output (see tsdown.config.mjs for details).
 */
export * from './sentry/index';
