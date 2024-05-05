import { createSigner } from "fast-jwt";

import { OpenIdProfile } from "../../src/types";

export function encodeMockJwt(jwtVals: Partial<OpenIdProfile>) {
  const signer = createSigner({ algorithm: "none" });
  const payload = {
    iss: "https://yourdomain.eu.auth0.com/",
    sub: "auth0|5a0eb...",
    aud: ["https://api.myapp.com", "https://yourdomain.eu.auth0.com/userinfo"],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    azp: "aZp123...",
    scope: "openid profile email",
    gty: "password",
    email: "email@example.com",
    email_verified: true,
    picture: "https://example.com/profile.jpg",
    name: "User Name",
    nickname: "usernickname",
    ...jwtVals,
  };

  return signer(payload);
}
