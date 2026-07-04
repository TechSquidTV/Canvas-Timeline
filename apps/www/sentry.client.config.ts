import * as Sentry from '@sentry/astro';

const sentryDsn = import.meta.env.PUBLIC_SENTRY_DSN;

if (import.meta.env.PROD && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enableMetrics: false,
    tracesSampleRate: 0,
  });
}
