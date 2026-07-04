/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SENTRY_DSN?: string;
}

declare module '*?raw' {
  const source: string;
  export default source;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

declare module '*.json' {
  const value: JsonValue;
  export default value;
}
