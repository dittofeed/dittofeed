import backendConfig from "backend-lib/src/config";
import axios from "axios";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { AuthLoginMethodsRequest } from "isomorphic-lib/src/types";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const validation = schemaValidateWithErr(req.body, AuthLoginMethodsRequest);
  if (validation.isErr()) {
    return res.status(400).json({ message: validation.error.message });
  }

  const cfg = backendConfig();
  try {
    const response = await axios.post(
      `${cfg.apiBase}/api/public/auth/login-methods`,
      validation.value,
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true,
      },
    );
    return res.status(response.status).json(response.data);
  } catch (e) {
    return res.status(502).json({ message: "Upstream error" });
  }
}
