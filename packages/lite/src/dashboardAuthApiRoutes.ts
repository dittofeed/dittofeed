import backendConfig from "backend-lib/src/config";
import type { DittofeedFastifyInstance } from "backend-lib/src/types";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  AuthLoginMethodsRequest,
  AuthMePasswordRequest,
  AuthPasswordLoginRequest,
} from "isomorphic-lib/src/types";

/**
 * Dashboard auth proxies normally live in Next.js API routes. In lite, Fastify
 * parses JSON for all PUT/POST before the Next catch-all runs, which drains
 * req.raw and causes Next to throw "Invalid body". These routes handle the same
 * paths first so only Fastify reads the body once.
 */
export async function registerDashboardAuthApiRoutes(
  app: DittofeedFastifyInstance,
): Promise<void> {
  app.post(
    "/dashboard/api/auth/login-methods",
    async (request, reply) => {
      const validation = schemaValidateWithErr(
        request.body,
        AuthLoginMethodsRequest,
      );
      if (validation.isErr()) {
        return reply.status(400).send({ message: validation.error.message });
      }

      const cfg = backendConfig();
      try {
        const response = await fetch(
          `${cfg.apiBase}/api/public/auth/login-methods`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validation.value),
          },
        );
        const ct = response.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          return reply
            .status(response.status)
            .send(await response.json());
        }
        return reply.status(response.status).send(await response.text());
      } catch {
        return reply.status(502).send({ message: "Upstream error" });
      }
    },
  );

  app.post(
    "/dashboard/api/auth/password-login",
    async (request, reply) => {
      const validation = schemaValidateWithErr(
        request.body,
        AuthPasswordLoginRequest,
      );
      if (validation.isErr()) {
        return reply.status(400).send({ message: validation.error.message });
      }

      const cfg = backendConfig();
      try {
        const response = await fetch(
          `${cfg.apiBase}/api/public/auth/password-login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validation.value),
          },
        );

        const setCookies =
          typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : [];
        if (setCookies.length > 0) {
          for (const c of setCookies) {
            reply.raw.appendHeader("Set-Cookie", c);
          }
        } else {
          const single = response.headers.get("set-cookie");
          if (single) {
            reply.raw.appendHeader("Set-Cookie", single);
          }
        }

        return reply.status(response.status).send();
      } catch {
        return reply.status(502).send();
      }
    },
  );

  app.put(
    "/dashboard/api/auth/me/password",
    async (request, reply) => {
      const validation = schemaValidateWithErr(
        request.body,
        AuthMePasswordRequest,
      );
      if (validation.isErr()) {
        return reply.status(400).send({ message: validation.error.message });
      }

      const cookie = request.headers.cookie;
      if (!cookie) {
        return reply.status(401).send();
      }

      const cfg = backendConfig();
      try {
        const response = await fetch(`${cfg.apiBase}/api/auth/me/password`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: JSON.stringify(validation.value),
        });

        const ct = response.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const text = await response.text();
          try {
            return reply.status(response.status).send(JSON.parse(text));
          } catch {
            return reply.status(response.status).send(text);
          }
        }
        return reply.status(response.status).send();
      } catch {
        return reply.status(502).send();
      }
    },
  );
}
