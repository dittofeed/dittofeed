import { serialize } from "cookie"; // Using the 'cookie' library for serialization
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import {
  schemaValidateWithErr, // Use this for direct object validation
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SetCsrfCookieRequest } from "isomorphic-lib/src/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiAuth } from "../../../lib/requestContext"; // Adjusted path assuming lib is at src/lib

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Authenticate the request
  const authResult = await apiAuth(req);
  if (authResult.isErr()) {
    const { status, message } = authResult.error;
    return res.status(status).json({ message });
  }
  // const dfContext = authResult.value; // dfContext is available if needed by the endpoint's logic

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Assume Next.js has parsed the JSON body if Content-Type was application/json
  // Directly validate the req.body object
  const validationResult = schemaValidateWithErr(
    req.body, // req.body is expected to be the parsed object
    SetCsrfCookieRequest,
  );

  if (validationResult.isErr()) {
    // schemaValidateWithErr returns an Error object in the err case
    const errorMessage = validationResult.error.message;
    return res
      .status(400)
      .json({ message: "Invalid request body", error: errorMessage });
  }

  // At this point, validationResult.value is the validated SetCsrfCookieRequest object
  const { csrfToken, expiresAt } = validationResult.value;

  try {
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      expires: new Date(expiresAt),
    };

    const cookieString = serialize(OAUTH_COOKIE_NAME, csrfToken, cookieOptions);
    res.setHeader("Set-Cookie", cookieString);
    return res.status(204).end();
  } catch (error) {
    // console.error("Error setting cookie:", error); // Consider logging errors
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    return res
      .status(500)
      .json({ message: `Internal server error: ${errMessage}` });
  }
}
