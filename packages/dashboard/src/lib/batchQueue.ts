// Generic type for the executeBatch function
export type BatchFunction<T> = (tasks: T[]) => Promise<void>;

// Generic class that takes a task type T
export class BatchQueue<T> {
  private queue: T[]; // The queue to hold the tasks

  private batchSize: number; // The maximum size of a batch

  private timeout: number; // The timeout in milliseconds

  private timeoutHandle: ReturnType<typeof setTimeout> | null; // Handle for the timeout, null when there's no active timeout

  private executeBatch: BatchFunction<T>; // The function to execute a batch of tasks

  constructor({
    batchSize = 10, // default batch size is 10
    timeout = 2000, // default timeout is 2000ms (2 seconds)
    executeBatch,
  }: {
    batchSize?: number;
    timeout?: number;
    executeBatch: BatchFunction<T>;
  }) {
    this.queue = [];
    this.batchSize = batchSize;
    this.timeout = timeout;
    this.timeoutHandle = null;
    this.executeBatch = executeBatch;
  }

  // Method to add a task to the queue
  submit(task: T): void {
    this.queue.push(task); // Add the task to the queue

    // If we've reached batch size, process the queue
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
    // If this is the first task added after the queue was processed, start the timeout
    else if (this.queue.length === 1) {
      this.startTimer();
    }
  }

  // Start a timeout that will process the queue when it triggers
  private startTimer(): void {
    this.timeoutHandle = setTimeout(() => this.flush(), this.timeout);
  }

  // Clear the current timeout
  private clearTimer(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  // Process the queue by executing the batch function with the current batch, then remove the batch from the queue
  async flush(): Promise<void> {
    this.clearTimer(); // Clear any existing timeout

    // If the queue is empty, there's nothing to process
    if (this.queue.length === 0) {
      return;
    }

    // Create a batch from the queue and remove the processed tasks
    const batch = this.queue.slice(0, this.batchSize);
    this.queue = this.queue.slice(this.batchSize);

    // Execute the batch function with the current batch
    await this.executeBatch(batch);
  }
}
