import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenGraphImage } from 'astro-og-canvas';
import { getOpenGraphPages } from '#www/lib/open-graph-pages';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(appRoot, 'public/open-graph');

process.chdir(appRoot);

const pages = await getOpenGraphPages();

await rm(outputRoot, { force: true, recursive: true });

for (const [route, page] of Object.entries(pages)) {
  const outputPath = join(outputRoot, `${route}.png`);
  const image = await generateOpenGraphImage({
    title: page.title,
    description: wrapOpenGraphDescription(page.description),
    logo: {
      path: './public/logo.svg',
      size: [84, 80],
    },
    bgImage: {
      path: './src/assets/og-background.webp',
      fit: 'cover',
    },
    border: {
      color: [20, 184, 166],
      side: 'block-end',
      width: 10,
    },
    padding: 74,
    font: {
      title: {
        color: [15, 23, 42],
        families: ['Outfit'],
        lineHeight: 1.04,
        size: 66,
        weight: 'ExtraBold',
      },
      description: {
        color: [71, 85, 105],
        families: ['Outfit'],
        lineHeight: 1.28,
        size: 34,
        weight: 'Medium',
      },
    },
    fonts: ['./node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2'],
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, new Uint8Array(await new Response(image).arrayBuffer()));
}

console.info(`Generated ${Object.keys(pages).length} OpenGraph images.`);

function wrapOpenGraphDescription(description: string): string {
  const maxLineLength = 35;
  const maxLines = 4;
  const words = description.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxLineLength) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const wrapped = lines.slice(0, maxLines);
  const wrappedWordCount = wrapped.join(' ').split(/\s+/u).filter(Boolean).length;

  if (wrappedWordCount < words.length && wrapped.length > 0) {
    const finalIndex = wrapped.length - 1;
    wrapped[finalIndex] = `${wrapped[finalIndex].replace(/[.,;:!?]$/u, '')}...`;
  }

  return wrapped.join('\n');
}
