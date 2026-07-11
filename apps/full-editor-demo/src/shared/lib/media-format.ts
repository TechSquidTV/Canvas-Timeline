export function formatFrameRate(frameRate: number) {
  return frameRate >= 100 || Number.isInteger(frameRate)
    ? frameRate.toFixed(0)
    : frameRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
