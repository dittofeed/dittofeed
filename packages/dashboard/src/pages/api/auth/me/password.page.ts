import backendConfig from "backend-lib/src/config";
import axios from "axios";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { AuthMePasswordRequest } from "isomorphic-lib/src/types";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", ["PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const validation = schemaValidateWithErr(req.body, AuthMePasswordRequest);
  if (validation.isErr()) {
    return res.status(400).json({ message: validation.error.message });
  }

  const cfg = backendConfig();
  const cookie = req.headers.cookie;
  if (!cookie) {
    return res.status(401).end();
  }

  try {
    const response = await axios.put(
      `${cfg.apiBase}/api/auth/me/password`,
      validation.value,
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        validateStatus: () => true,
      },
    );
    if (
      response.data !== undefined &&
      response.data !== null &&
      response.data !== "" &&
      typeof response.data === "object"
    ) {
      return res.status(response.status).json(response.data);
    }
    return res.status(response.status).end();
  } catch {
    return res.status(502).end();
  }
}
