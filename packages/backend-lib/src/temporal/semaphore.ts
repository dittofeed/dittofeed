/* eslint-disable no-await-in-loop */
// workflows/Semaphore.ts
import { condition } from "@temporalio/workflow";

export class Semaphore {
  private currentCount = 0;

  constructor(private readonly maxConcurrent: number) {}

  /**
   * Acquire a "slot" in the semaphore.
   * If no slot is available, block (yield) until one opens up.
   */
  public async acquire(): Promise<void> {
    // Wait until there's room
    while (this.currentCount >= this.maxConcurrent) {
      await condition(() => this.currentCount < this.maxConcurrent);
    }
    this.currentCount += 1;
  }

  /**
   * Release a slot back to the semaphore.
   * Typically called in a `.finally()` handler after an activity completes.
   */
  public release(): void {
    this.currentCount -= 1;
  }
}
