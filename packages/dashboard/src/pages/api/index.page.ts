// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Used for health checks
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).end();
}
