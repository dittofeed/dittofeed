import { serialize } from "cookie"; // Using the 'cookie' library for serialization
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import {
  jsonParseSafeWithSchema,
  schemaValidate,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SetCsrfCookieRequest } from "isomorphic-lib/src/types";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const parsedBody = jsonParseSafeWithSchema(req.body, SetCsrfCookieRequest);

  if (parsedBody.isErr()) {
    // console.error("Invalid request body:", parsedBody.error);
    return res
      .status(400)
      .json({ message: "Invalid request body", errors: parsedBody.error });
  }

  // Re-validate with schemaValidate to be absolutely sure after parsing, or rely on jsonParseSafeWithSchema
  // For simplicity, if jsonParseSafeWithSchema passed, we assume it's structurally okay.
  // If more detailed validation errors are needed from schemaValidate, it can be used here.
  const validationResult = schemaValidate(
    parsedBody.value,
    SetCsrfCookieRequest,
  );
  if (validationResult.isErr()) {
    return res.status(400).json({
      message: "Invalid request body after validation",
      errors: validationResult.error,
    });
  }

  const { csrfToken, expiresAt } = validationResult.value;

  try {
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const, // Ensures 'lax' is treated as a literal for typing
      expires: new Date(expiresAt),
    };

    const cookieString = serialize(OAUTH_COOKIE_NAME, csrfToken, cookieOptions);
    res.setHeader("Set-Cookie", cookieString);
    return res.status(204).end();
  } catch (error) {
    // console.error("Error setting cookie:", error);
    const err = error as Error;
    return res
      .status(500)
      .json({ message: `Internal server error: ${err.message}` });
  }
}
