const demoClipColors = [
  'oklch(0.62 0.16 250)',
  'oklch(0.68 0.14 145)',
  'oklch(0.72 0.16 70)',
  'oklch(0.65 0.17 25)',
  'oklch(0.58 0.18 305)',
  'oklch(0.64 0.12 195)',
] as const;

export function getDemoClipColor(index: number) {
  return demoClipColors[index % demoClipColors.length];
}
