import type { BlockContent, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import type { Node, Parent } from 'unist';
import { toString } from 'mdast-util-to-string';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { CONTINUE, SKIP, visit } from 'unist-util-visit';
import { docsSections, type DocsSectionId, type OrderedDoc } from '#www/data/docs';
import { site } from '#www/data/site';

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
    listItemIndent: 'one',
    rule: '-',
    ruleRepetition: 3,
  })
  .freeze();

const docsIndexTitle = 'Canvas Timeline documentation';
const docsIndexDescription =
  'Guides, package notes, interactive demos, and generated references for the Canvas Timeline package family.';

type MdxAttributeValueExpression = {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
};

type MdxAttribute = {
  type: 'mdxJsxAttribute';
  name: string;
  value?: string | MdxAttributeValueExpression | null;
};

type MdxElement = Parent & {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: MdxAttribute[];
};

type ParentNode = Node & Parent;

type DocsMarkdownOptions = {
  siteUrl?: string;
};

type DocsMarkdownPage = {
  title: string;
  description: string;
  path: string;
  markdownPath: string;
  body: string;
};

export type DocsMarkdownEntry = OrderedDoc & {
  body?: string;
};

export function buildDocsMarkdown(entry: DocsMarkdownEntry, options: DocsMarkdownOptions = {}) {
  return formatDocsMarkdownPage(
    {
      title: entry.data.title,
      description: entry.data.description,
      path: `/docs/${entry.id}`,
      markdownPath: `/docs/${entry.id}.md`,
      body: sanitizeDocsMdx(entry.body ?? ''),
    },
    options
  );
}

export function buildDocsIndexMarkdown(
  docs: readonly OrderedDoc[],
  options: DocsMarkdownOptions = {}
) {
  const sortedDocs = [...docs].sort((a, b) => a.data.order - b.data.order);
  const body = [
    'Welcome to the documentation for **Canvas Timeline**. This library helps you build high-performance, frame-accurate, and customizable video, audio, or animation timelines in React.',
    '',
    'This Markdown file is a generated documentation index. Each listed page also has its own Markdown endpoint for copying or LLM-assisted lookup.',
    '',
    '```shell',
    'pnpm add @techsquidtv/canvas-timeline',
    '```',
    '',
    '## Where to start?',
    '',
    '- [Getting Started](/docs/getting-started) - Install the packages, create a timeline engine, and render a basic interactive timeline surface.',
    '- [System Architecture](/docs/architecture) - Understand the state model, rendering layer boundaries, and metadata separation.',
    '- [Package Boundaries](/docs/packages-overview) - Choose the right package entrypoint for your integration.',
    '- [Media Adapters](/docs/media-adapters) - Connect native or decoded previews with app-owned source policy and lazy lifecycle controls.',
    '- [Live Demos](/docs/demos-overview) - Explore source-backed examples and inspect their code.',
    '',
    '## Architectural pillars',
    '',
    '- **State-first serialization** - The timeline is modeled as pure serializable JSON state for undo, collaboration, and persistence.',
    '- **Precision via RationalTime** - Time values are stored as fractions to avoid floating-point drift.',
    '- **Canvas-driven high performance** - Dense visuals are drawn on canvas so large timelines stay responsive.',
    '- **Frictionless React hooks** - DOM overlays, controls, and menus stay synchronized through React bindings.',
    '',
    '## Documentation pages',
    '',
    ...docsSections.flatMap((section) => sectionMarkdown(section.id, section.title, sortedDocs)),
  ].join('\n');

  return formatDocsMarkdownPage(
    {
      title: docsIndexTitle,
      description: docsIndexDescription,
      path: '/docs',
      markdownPath: '/docs.md',
      body,
    },
    options
  );
}

export function sanitizeDocsMdx(source: string) {
  const body = stripFrontmatter(source).trim();

  if (body.length === 0) {
    return '';
  }

  const tree = markdownProcessor.parse(body) as Root;
  const root = {
    ...tree,
    children: transformNodes(tree.children),
  } satisfies Root;

  removeEmptyParagraphs(root);

  return normalizeMarkdown(markdownProcessor.stringify(root));
}

function sectionMarkdown(sectionId: DocsSectionId, title: string, docs: readonly OrderedDoc[]) {
  const sectionDocs = docs.filter((doc) => doc.data.section === sectionId);

  if (sectionDocs.length === 0) {
    return [];
  }

  return [
    `### ${title}`,
    '',
    ...sectionDocs.map(
      (doc) =>
        `- **${doc.data.title}** - ${doc.data.description} [Page](/docs/${doc.id}) | [Markdown](/docs/${doc.id}.md)`
    ),
    '',
  ];
}

function formatDocsMarkdownPage(page: DocsMarkdownPage, options: DocsMarkdownOptions) {
  const siteUrl = options.siteUrl ?? site.url;
  const htmlUrl = absoluteUrl(page.path, siteUrl);
  const markdownUrl = absoluteUrl(page.markdownPath, siteUrl);
  const metadata = [
    page.description,
    '',
    `Source: ${htmlUrl}`,
    `Markdown: ${markdownUrl}`,
    '',
    '---',
  ].join('\n');

  return normalizeMarkdown(`# ${page.title}\n\n${metadata}\n\n${page.body}`);
}

function transformNodes(nodes: readonly Node[]): RootContent[] {
  return nodes.flatMap((node) => transformNode(node));
}

function transformNode(node: Node): RootContent[] {
  if (isMdxControlNode(node)) {
    return [];
  }

  if (isMdxElement(node)) {
    return transformMdxElement(node);
  }

  if (isParentNode(node)) {
    return [cloneWithChildren(node, transformNodes(node.children))];
  }

  return [node as RootContent];
}

function transformMdxElement(node: MdxElement): RootContent[] {
  if (node.name === 'Callout') {
    return [calloutToBlockquote(node)];
  }

  if (node.name === 'PackageManagerTabs') {
    return [packageManagerTabsToCode(node)];
  }

  if (node.name === 'CodeBlock') {
    return [codeBlockToCode(node)];
  }

  if (node.name === 'br') {
    return [];
  }

  return [unsupportedMdxToParagraph(node)];
}

function calloutToBlockquote(node: MdxElement): RootContent {
  const kind = readStringAttribute(node, 'kind') ?? 'note';
  const title = readStringAttribute(node, 'title') ?? calloutDefaultTitle(kind);
  const transformedChildren = transformNodes(node.children).filter(isBlockContent);
  const label = paragraph([strongText(`${title} (${kind})`)]);

  return {
    type: 'blockquote',
    children: [label, ...transformedChildren],
  };
}

function packageManagerTabsToCode(node: MdxElement): RootContent {
  const packages = readStringAttribute(node, 'packages') ?? '<packages>';
  const dev = readBooleanAttribute(node, 'dev');
  const commands = [
    `pnpm add ${dev ? '-D ' : ''}${packages}`,
    `npm install ${dev ? '-D ' : ''}${packages}`,
    `yarn add ${dev ? '-D ' : ''}${packages}`,
    `bun add ${dev ? '-d ' : ''}${packages}`,
  ];

  return {
    type: 'code',
    lang: 'shell',
    value: commands.join('\n'),
  };
}

function codeBlockToCode(node: MdxElement): RootContent {
  const code =
    readStringAttribute(node, 'code') ?? toString({ type: 'root', children: node.children });
  const lang = readStringAttribute(node, 'lang');
  const variant = readStringAttribute(node, 'variant');

  return {
    type: 'code',
    lang: lang ?? (variant === 'terminal' ? 'shell' : undefined),
    value: code,
  };
}

function unsupportedMdxToParagraph(node: MdxElement): RootContent {
  const label =
    readStringAttribute(node, 'aria-label') ??
    readStringAttribute(node, 'title') ??
    textFromChildren(node.children) ??
    node.name ??
    'interactive content';

  return paragraph([text(`Rich content omitted: ${collapseWhitespace(label)}.`)]);
}

function removeEmptyParagraphs(root: Root) {
  visit(root, 'paragraph', (node, index, parent) => {
    if (!parent || index === undefined || toString(node).trim().length > 0) {
      return CONTINUE;
    }

    parent.children.splice(index, 1);
    return [SKIP, index];
  });
}

function stripFrontmatter(source: string) {
  return source.replace(/^---\s*[\s\S]*?\s*---\s*/, '');
}

function cloneWithChildren(node: ParentNode, children: RootContent[]): RootContent {
  return {
    ...node,
    children,
  } as RootContent;
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return {
    type: 'paragraph',
    children,
  };
}

function text(value: string): PhrasingContent {
  return {
    type: 'text',
    value,
  };
}

function strongText(value: string): PhrasingContent {
  return {
    type: 'strong',
    children: [text(value)],
  };
}

function readStringAttribute(node: MdxElement, name: string) {
  const value = node.attributes.find((attribute) => attribute.name === name)?.value;

  if (typeof value === 'string') {
    return value;
  }

  if (value && value.type === 'mdxJsxAttributeValueExpression') {
    return stripExpressionQuotes(value.value);
  }

  return undefined;
}

function readBooleanAttribute(node: MdxElement, name: string) {
  const value = node.attributes.find((attribute) => attribute.name === name)?.value;

  if (value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value === 'true';
  }

  if (value?.type === 'mdxJsxAttributeValueExpression') {
    return value.value === 'true';
  }

  return false;
}

function textFromChildren(children: readonly Node[]) {
  const transformedChildren = transformNodes(children);
  const value = toString({ type: 'root', children: transformedChildren }).trim();

  return value.length > 0 ? value : undefined;
}

function calloutDefaultTitle(kind: string) {
  if (kind === 'tip') {
    return 'Tip';
  }

  if (kind === 'warning') {
    return 'Watch out';
  }

  return 'Note';
}

function isMdxElement(node: Node): node is MdxElement {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}

function isMdxControlNode(node: Node) {
  return (
    node.type === 'mdxjsEsm' ||
    node.type === 'mdxFlowExpression' ||
    node.type === 'mdxTextExpression'
  );
}

function isParentNode(node: Node): node is ParentNode {
  return Array.isArray((node as Partial<Parent>).children);
}

function isBlockContent(node: RootContent): node is BlockContent {
  return node.type !== 'definition' && node.type !== 'footnoteDefinition';
}

function stripExpressionQuotes(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function absoluteUrl(path: string, siteUrl: string) {
  return new URL(path, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString();
}

function normalizeMarkdown(value: string) {
  return `${value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
