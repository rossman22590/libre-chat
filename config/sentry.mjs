import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';

const REQUIRED_SETTINGS = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
const ROOT_ENV_FILE = new URL('../.env', import.meta.url);
const ROOT_MANIFEST = new URL('../package.json', import.meta.url);

/** Reads the root `.env` without loading it into `process.env`, so builds are otherwise unaffected. */
function readRootEnv() {
  if (!existsSync(ROOT_ENV_FILE)) {
    return {};
  }
  return dotenv.parse(readFileSync(ROOT_ENV_FILE));
}

function readRootVersion() {
  return JSON.parse(readFileSync(ROOT_MANIFEST, 'utf8')).version;
}

/**
 * Nothing account-specific is committed: the token, organization and project
 * come from the build environment (CI secret, Docker build arg) or the root `.env`.
 */
function resolveSetting(name, env) {
  return env[name]?.trim() || readRootEnv()[name]?.trim() || undefined;
}

/**
 * Source maps upload on regular builds once the token, org and project are set. Test and
 * development builds, CI jobs and watch rebuilds are skipped;
 * `SENTRY_UPLOAD_SOURCEMAPS` forces either way.
 */
export function shouldUploadSourceMaps(env = process.env, argv = process.argv) {
  if (REQUIRED_SETTINGS.some((name) => !resolveSetting(name, env))) {
    return false;
  }
  if (env.SENTRY_UPLOAD_SOURCEMAPS === 'true') {
    return true;
  }
  if (env.SENTRY_UPLOAD_SOURCEMAPS === 'false' || env.CI) {
    return false;
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return false;
  }
  return !argv.includes('--watch') && !argv.includes('-w');
}

/** Options shared by the Sentry bundler plugins; an upload failure never fails the build. */
export function sentryBuildOptions(overrides = {}, env = process.env) {
  return {
    org: resolveSetting('SENTRY_ORG', env),
    project: resolveSetting('SENTRY_PROJECT', env),
    authToken: resolveSetting('SENTRY_AUTH_TOKEN', env),
    telemetry: false,
    release: { name: resolveSetting('SENTRY_RELEASE', env) ?? readRootVersion() },
    errorHandler: (error) => {
      console.warn(`[sentry] source map upload skipped: ${error.message}`);
    },
    ...overrides,
  };
}
