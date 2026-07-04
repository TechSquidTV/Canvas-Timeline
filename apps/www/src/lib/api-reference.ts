import apiReferenceData from '../../.generated/api-reference.json';

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

export const apiReference = apiReferenceData as ApiReference;

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
