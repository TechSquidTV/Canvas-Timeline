export interface ApiParameter {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
  summary?: string;
}

export interface ApiTypeParameter {
  name: string;
  default?: string;
  constraint?: string;
  summary?: string;
}

export interface ApiMember {
  name: string;
  kind: string;
  signature: string;
  type?: string;
  optional: boolean;
  params: ApiParameter[];
  returns?: string;
  summary?: string;
}

interface ApiLiteralTable {
  columns: string[];
  rows: Record<string, string>[];
}

interface ApiAlias {
  packageSlug: string;
  packageName: string;
  symbolName: string;
  symbolSlug: string;
}

export interface ApiSymbol {
  slug: string;
  name: string;
  kind: string;
  summary: string;
  signature: string;
  params: ApiParameter[];
  typeParameters: ApiTypeParameter[];
  properties: ApiMember[];
  methods: ApiMember[];
  constructors: ApiMember[];
  returnMembers: ApiMember[];
  literalTable?: ApiLiteralTable;
  aliasOf?: ApiAlias;
  returns?: string;
  returnsSummary?: string;
  examples: string[];
  sourcePackage: string;
  packageName?: string;
  source?: {
    fileName: string;
    line: number;
    url?: string;
  };
}

export interface ApiPackage {
  slug: string;
  name: string;
  entryPoint: string;
  symbols: ApiSymbol[];
  warnings: string[];
}

export interface ApiReference {
  generatedAt: string;
  packages: ApiPackage[];
  symbols: ApiSymbol[];
  warnings: string[];
}

type JsonObject = { readonly [key: string]: JsonValue };

const apiReferenceModules = import.meta.glob<JsonValue>('../../.generated/api-reference.json', {
  eager: true,
  import: 'default',
});
const apiReferenceData =
  apiReferenceModules['../../.generated/api-reference.json'] ??
  ({
    generatedAt: '',
    packages: [],
    symbols: [],
    warnings: ['API reference has not been generated.'],
  } satisfies ApiReference);

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(value: JsonValue | undefined, fieldName: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new TypeError(`API reference field "${fieldName}" must be an object.`);
  }

  return value;
}

function readString(value: JsonValue | undefined, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`API reference field "${fieldName}" must be a string.`);
  }

  return value;
}

function readBoolean(value: JsonValue | undefined, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`API reference field "${fieldName}" must be a boolean.`);
  }

  return value;
}

function readNumber(value: JsonValue | undefined, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`API reference field "${fieldName}" must be a number.`);
  }

  return value;
}

function readOptionalString(value: JsonValue | undefined, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readString(value, fieldName);
}

function readArray(value: JsonValue | undefined, fieldName: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`API reference field "${fieldName}" must be an array.`);
  }

  return value;
}

function readStringArray(value: JsonValue | undefined, fieldName: string): string[] {
  return readArray(value, fieldName).map((item, index) =>
    readString(item, `${fieldName}[${index}]`)
  );
}

function readRecordArray(
  value: JsonValue | undefined,
  fieldName: string
): Record<string, string>[] {
  return readArray(value, fieldName).map((item, index) => {
    const object = readObject(item, `${fieldName}[${index}]`);
    return Object.fromEntries(
      Object.entries(object).map(([key, entry]) => [key, readString(entry, `${fieldName}.${key}`)])
    );
  });
}

function parseApiParameter(value: JsonValue, fieldName: string): ApiParameter {
  const object = readObject(value, fieldName);

  return {
    name: readString(object.name, `${fieldName}.name`),
    type: readOptionalString(object.type, `${fieldName}.type`) ?? 'unknown',
    optional: readBoolean(object.optional, `${fieldName}.optional`),
    defaultValue: readOptionalString(object.defaultValue, `${fieldName}.defaultValue`),
    summary: readOptionalString(object.summary, `${fieldName}.summary`),
  };
}

function parseApiTypeParameter(value: JsonValue, fieldName: string): ApiTypeParameter {
  const object = readObject(value, fieldName);

  return {
    name: readString(object.name, `${fieldName}.name`),
    default: readOptionalString(object.default, `${fieldName}.default`),
    constraint: readOptionalString(object.constraint, `${fieldName}.constraint`),
    summary: readOptionalString(object.summary, `${fieldName}.summary`),
  };
}

function parseApiMember(value: JsonValue, fieldName: string): ApiMember {
  const object = readObject(value, fieldName);

  return {
    name: readString(object.name, `${fieldName}.name`),
    kind: readString(object.kind, `${fieldName}.kind`),
    signature: readString(object.signature, `${fieldName}.signature`),
    type: readOptionalString(object.type, `${fieldName}.type`),
    optional: readBoolean(object.optional, `${fieldName}.optional`),
    params: readArray(object.params, `${fieldName}.params`).map((item, index) =>
      parseApiParameter(item, `${fieldName}.params[${index}]`)
    ),
    returns: readOptionalString(object.returns, `${fieldName}.returns`),
    summary: readOptionalString(object.summary, `${fieldName}.summary`),
  };
}

function parseLiteralTable(value: JsonValue | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  const object = readObject(value, fieldName);

  return {
    columns: readStringArray(object.columns, `${fieldName}.columns`),
    rows: readRecordArray(object.rows, `${fieldName}.rows`),
  };
}

function parseApiAlias(value: JsonValue | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  const object = readObject(value, fieldName);

  return {
    packageSlug: readString(object.packageSlug, `${fieldName}.packageSlug`),
    packageName: readString(object.packageName, `${fieldName}.packageName`),
    symbolName: readString(object.symbolName, `${fieldName}.symbolName`),
    symbolSlug: readString(object.symbolSlug, `${fieldName}.symbolSlug`),
  };
}

function parseApiSource(value: JsonValue | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  const object = readObject(value, fieldName);

  return {
    fileName: readString(object.fileName, `${fieldName}.fileName`),
    line: readNumber(object.line, `${fieldName}.line`),
    url: readOptionalString(object.url, `${fieldName}.url`),
  };
}

function parseApiSymbol(value: JsonValue, fieldName: string): ApiSymbol {
  const object = readObject(value, fieldName);

  return {
    slug: readString(object.slug, `${fieldName}.slug`),
    name: readString(object.name, `${fieldName}.name`),
    kind: readString(object.kind, `${fieldName}.kind`),
    summary: readString(object.summary, `${fieldName}.summary`),
    signature: readString(object.signature, `${fieldName}.signature`),
    params: readArray(object.params, `${fieldName}.params`).map((item, index) =>
      parseApiParameter(item, `${fieldName}.params[${index}]`)
    ),
    typeParameters: readArray(object.typeParameters, `${fieldName}.typeParameters`).map(
      (item, index) => parseApiTypeParameter(item, `${fieldName}.typeParameters[${index}]`)
    ),
    properties: readArray(object.properties, `${fieldName}.properties`).map((item, index) =>
      parseApiMember(item, `${fieldName}.properties[${index}]`)
    ),
    methods: readArray(object.methods, `${fieldName}.methods`).map((item, index) =>
      parseApiMember(item, `${fieldName}.methods[${index}]`)
    ),
    constructors: readArray(object.constructors, `${fieldName}.constructors`).map((item, index) =>
      parseApiMember(item, `${fieldName}.constructors[${index}]`)
    ),
    returnMembers: readArray(object.returnMembers, `${fieldName}.returnMembers`).map(
      (item, index) => parseApiMember(item, `${fieldName}.returnMembers[${index}]`)
    ),
    literalTable: parseLiteralTable(object.literalTable, `${fieldName}.literalTable`),
    aliasOf: parseApiAlias(object.aliasOf, `${fieldName}.aliasOf`),
    returns: readOptionalString(object.returns, `${fieldName}.returns`),
    returnsSummary: readOptionalString(object.returnsSummary, `${fieldName}.returnsSummary`),
    examples: readStringArray(object.examples, `${fieldName}.examples`),
    sourcePackage: readString(object.sourcePackage, `${fieldName}.sourcePackage`),
    packageName: readOptionalString(object.packageName, `${fieldName}.packageName`),
    source: parseApiSource(object.source, `${fieldName}.source`),
  };
}

function parseApiPackage(value: JsonValue, fieldName: string): ApiPackage {
  const object = readObject(value, fieldName);

  return {
    slug: readString(object.slug, `${fieldName}.slug`),
    name: readString(object.name, `${fieldName}.name`),
    entryPoint: readString(object.entryPoint, `${fieldName}.entryPoint`),
    symbols: readArray(object.symbols, `${fieldName}.symbols`).map((item, index) =>
      parseApiSymbol(item, `${fieldName}.symbols[${index}]`)
    ),
    warnings: readStringArray(object.warnings, `${fieldName}.warnings`),
  };
}

function parseApiReference(value: JsonValue): ApiReference {
  const object = readObject(value, 'apiReference');

  return {
    generatedAt: readString(object.generatedAt, 'apiReference.generatedAt'),
    packages: readArray(object.packages, 'apiReference.packages').map((item, index) =>
      parseApiPackage(item, `apiReference.packages[${index}]`)
    ),
    symbols: readArray(object.symbols, 'apiReference.symbols').map((item, index) =>
      parseApiSymbol(item, `apiReference.symbols[${index}]`)
    ),
    warnings: readStringArray(object.warnings, 'apiReference.warnings'),
  };
}

export const apiReference = parseApiReference(apiReferenceData);

function getApiPackage(slug: string) {
  return apiReference.packages.find((packageDoc) => packageDoc.slug === slug);
}

export function getApiSymbol(packageSlug: string, symbolSlug: string) {
  return getApiPackage(packageSlug)?.symbols.find((symbol) => symbol.slug === symbolSlug);
}

export function apiPackageHref(packageSlug: string) {
  return `/packages/${packageSlug}/api`;
}

export function apiSymbolHref(packageSlug: string, symbolSlug: string) {
  return `${apiPackageHref(packageSlug)}/${symbolSlug}`;
}
