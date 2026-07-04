import * as Sentry from '@sentry/cloudflare';
import handler from '@astrojs/cloudflare/entrypoints/server';

type SentryEnv = {
  SENTRY_DSN?: string;
};

export default Sentry.withSentry(
  (env: SentryEnv) => ({
    dsn: env.SENTRY_DSN,
    enableMetrics: true,
    tracesSampleRate: 1.0,
  }),
  handler
);
