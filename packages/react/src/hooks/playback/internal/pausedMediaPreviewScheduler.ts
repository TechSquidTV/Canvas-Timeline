export class PausedMediaPreviewScheduler {
  private frame: number | null = null;
  private generation = 0;

  cancel() {
    this.generation += 1;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  isCurrent(generation: number) {
    return this.generation === generation;
  }

  schedule(run: (generation: number) => void) {
    if (this.frame !== null) {
      return;
    }

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.generation += 1;
      run(this.generation);
    });
  }
}
