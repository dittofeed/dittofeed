import { OpenIdProfile } from "./types";

export function isProfileEmailVerified(profile: OpenIdProfile): boolean {
  return profile.email_verified === "true" || profile.email_verified === true;
}
