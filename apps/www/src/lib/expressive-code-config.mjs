import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { defineEcConfig } from 'astro-expressive-code';

export const expressiveCodeOptions = defineEcConfig({
  themes: ['aurora-x'],
  shiki: {
    engine: 'javascript',
  },
  plugins: [pluginCollapsibleSections()],
  useDarkModeMediaQuery: false,
  frames: {
    showCopyToClipboardButton: true,
  },
  styleOverrides: {
    borderRadius: 'var(--code-radius)',
    borderColor: 'var(--code-border)',
    codeBackground: 'var(--code-surface)',
    codeForeground: 'var(--code-foreground)',
    codeFontFamily: 'var(--font-mono)',
    codeFontSize: 'var(--code-font-size)',
    codeLineHeight: 'var(--code-line-height)',
    codePaddingBlock: 'var(--code-padding)',
    codePaddingInline: 'var(--code-padding)',
    scrollbarThumbColor: 'var(--code-scrollbar-thumb)',
    scrollbarThumbHoverColor: 'var(--code-scrollbar-thumb-hover)',
    uiFontFamily: 'var(--font-mono)',
    uiFontSize: '0.76rem',
    frames: {
      editorActiveTabBackground: 'var(--code-header-bg)',
      editorActiveTabForeground: 'var(--code-muted)',
      editorTabBarBackground: 'var(--code-header-bg)',
      editorTabBarBorderColor: 'var(--code-border)',
      editorTabBarBorderBottomColor: 'var(--code-border)',
      terminalTitlebarBackground: 'var(--code-header-bg)',
      terminalTitlebarForeground: 'var(--code-muted)',
      terminalTitlebarBorderBottomColor: 'var(--code-border)',
      terminalBackground: 'var(--code-surface)',
      frameBoxShadowCssValue: '0 10px 30px -18px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.1)',
    },
  },
});
