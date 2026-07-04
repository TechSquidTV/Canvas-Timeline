import { createRenderer, type ExpressiveCodeBlockOptions } from 'rehype-expressive-code';
import { toHtml } from 'rehype-expressive-code/hast';
import { expressiveCodeOptions } from './expressive-code-config.mjs';

type RenderCodeOptions = {
  code: string;
  lang: string;
  meta: string;
  sourceUrl: string;
};

let rendererPromise: ReturnType<typeof createRenderer> | undefined;

function getRenderer() {
  rendererPromise ??= createRenderer(expressiveCodeOptions);
  return rendererPromise;
}

function stringifyStyles(styles: string | Iterable<string>) {
  return typeof styles === 'string' ? styles : Array.from(styles).join('');
}

export async function renderExpressiveCode({ code, lang, meta, sourceUrl }: RenderCodeOptions) {
  const renderer = await getRenderer();
  const input: ExpressiveCodeBlockOptions = {
    code,
    language: lang,
    meta,
    parentDocument: {
      sourceFilePath: sourceUrl,
      positionInDocument: {
        groupIndex: 0,
      },
    },
  };
  const { renderedGroupAst, styles } = await renderer.ec.render(input);
  const groupStyles = stringifyStyles(styles);
  const styleHtml = `<style>${renderer.baseStyles}${renderer.themeStyles}${groupStyles}</style>`;
  const scriptHtml = renderer.jsModules
    .map((moduleCode) => `<script type="module">${moduleCode}</script>`)
    .join('');

  return `${styleHtml}${scriptHtml}${toHtml(renderedGroupAst)}`;
}
