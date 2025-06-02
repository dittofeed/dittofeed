import { serialize } from "cookie"; // Using the 'cookie' library for serialization
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import {
  jsonParseSafeWithSchema,
  // schemaValidate, // schemaValidate is redundant if jsonParseSafeWithSchema validates
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

  // Ensure req.body is a string for jsonParseSafeWithSchema if Next.js has pre-parsed it
  let bodyToParse: string;
  if (typeof req.body === "string") {
    bodyToParse = req.body;
  } else if (typeof req.body === "object" && req.body !== null) {
    try {
      bodyToParse = JSON.stringify(req.body);
    } catch (e) {
      return res.status(400).json({ message: "Invalid JSON body format." });
    }
  } else {
    // Handle cases where req.body is not a string or object (e.g., undefined)
    return res
      .status(400)
      .json({ message: "Request body must be a valid JSON string or object." });
  }

  const parsedBody = jsonParseSafeWithSchema(bodyToParse, SetCsrfCookieRequest);

  if (parsedBody.isErr()) {
    return res.status(400).json({
      message: "Invalid request body schema",
      errors: parsedBody.error,
    });
  }

  const { csrfToken, expiresAt } = parsedBody.value;

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
