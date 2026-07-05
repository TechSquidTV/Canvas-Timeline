const aboutLinks = [
  {
    description: 'Project website and demos.',
    href: 'https://canvastimeline.com',
    label: 'Website',
  },
  {
    description: 'Guides, API notes, and examples.',
    href: 'https://canvastimeline.com/docs',
    label: 'Documentation',
  },
  {
    description: 'Full editor demo app source.',
    href: 'https://github.com/TechSquidTV/Canvas-Timeline/tree/main/apps/full-editor-demo',
    label: 'Demo source code',
  },
  {
    description: 'Canvas Timeline monorepo.',
    href: 'https://github.com/TechSquidTV/Canvas-Timeline',
    label: 'GitHub repository',
  },
] as const;

export function AboutMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="editor-menu-popover editor-about-menu">
      <section className="editor-menu-section">
        <h2 className="editor-menu-section-title">About Canvas Timeline</h2>
        <div className="editor-menu-link-list">
          {aboutLinks.map((link) => (
            <a
              className="editor-menu-link"
              href={link.href}
              key={link.href}
              onClick={onNavigate}
              rel="noreferrer"
              target="_blank"
            >
              <span>{link.label}</span>
              <small>{link.description}</small>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
