import { PiiCategory } from "./types";

/**
 * Literal placeholder returned in place of a PII value when the viewer is not
 * permitted to unmask it. Mirrors the approach used by Snowflake masking
 * policies, which replace a value with a constant rather than a partially
 * obfuscated string.
 */
export const PII_MASKED = "MASKED";

export function maskPiiValue(): string {
  return PII_MASKED;
}

export function isMaskedPii(value: unknown): boolean {
  return value === PII_MASKED;
}

/**
 * Categories that are treated as PII when a field is auto-classified from its
 * name. Used by the settings UI to pre-select obvious candidates.
 */
export const PII_NAME_HINTS: Record<string, PiiCategory> = {
  email: "Email",
  emailaddress: "Email",
  "e-mail": "Email",
  phone: "Phone",
  phonenumber: "Phone",
  "phone_number": "Phone",
  mobile: "Phone",
  firstname: "Name",
  lastname: "Name",
  fullname: "Name",
  name: "Name",
  address: "Address",
  address1: "Address",
  address2: "Address",
  street: "Address",
  city: "Address",
  postalcode: "Address",
  zip: "Address",
  zipcode: "Address",
  ssn: "GovernmentId",
  taxid: "GovernmentId",
  passport: "GovernmentId",
  nationalid: "GovernmentId",
  dateofbirth: "DateOfBirth",
  dob: "DateOfBirth",
  birthday: "DateOfBirth",
  ip: "IpAddress",
  ipaddress: "IpAddress",
  creditcard: "Financial",
  cardnumber: "Financial",
  iban: "Financial",
};

export function guessPiiCategory(fieldName: string): PiiCategory | null {
  const normalized = fieldName.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return PII_NAME_HINTS[normalized] ?? null;
}
