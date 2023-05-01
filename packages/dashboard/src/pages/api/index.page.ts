import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Used for health checks
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).end();
}
