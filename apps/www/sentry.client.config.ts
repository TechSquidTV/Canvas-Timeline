import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  enableMetrics: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
