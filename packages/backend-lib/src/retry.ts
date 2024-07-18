import { LoggerSinks } from "@temporalio/workflow";

/* eslint-disable no-await-in-loop */
export async function retryExponential({
  sleep,
  check,
  baseDelay = 1000,
  maxAttempts = 10,
  logger,
}: {
  check: () => Promise<boolean>;
  sleep: (delay: number) => Promise<void>;
  maxAttempts?: number;
  baseDelay?: number;
  logger: LoggerSinks["defaultWorkerLogger"];
}): Promise<boolean> {
  logger.debug("retry exponential started");
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const result = await check();
      if (result) {
        logger.debug("retry exponential succeeded");
        return true;
      }
    } catch (e) {
      const err = e as Error;
      logger.error(`Attempt ${attempt + 1} failed: ${err.message}`);
    }

    attempt += 1;
    const delay = baseDelay * 2 ** attempt;

    logger.debug(`retry exponential did not succeed. retrying in ${delay} ms`);
    await sleep(delay);
  }
  return false;
}
