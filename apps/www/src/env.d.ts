/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SENTRY_DSN?: string;
}

declare module '*?raw' {
  const source: string;
  export default source;
}
