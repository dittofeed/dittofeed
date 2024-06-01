import logger from "./logger";

/* eslint-disable no-await-in-loop */
export async function retryExponential({
  sleep,
  check,
  baseDelay = 1000,
  maxAttempts = 10,
}: {
  check: () => Promise<boolean>;
  sleep: (delay: number) => Promise<void>;
  maxAttempts: number;
  baseDelay: number;
}) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      logger().debug(`Attempt ${attempt + 1}`);
      const result = await check();
      if (result) {
        logger().debug("retry exponential succeeded");
        return;
      }
    } catch (e) {
      const err = e as Error;
      logger().error(`Attempt ${attempt + 1} failed: ${err.message}`);
    }

    attempt += 1;
    const delay = baseDelay * 2 ** attempt;

    logger().debug(`Retrying in ${delay}ms`);
    await sleep(delay);
  }

  throw new Error("Activity did not succeed after maximum attempts");
}
