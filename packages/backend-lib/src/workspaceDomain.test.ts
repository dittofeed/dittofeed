import { isValidWorkspaceDomain } from "./workspaceDomain";

describe("isValidWorkspaceDomain", () => {
  it.each([
    "gmail.com",
    "GMAIL.COM",
    "foo.gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "aol.com",
    "icloud.com",
    "protonmail.com",
    "zoho.com",
    "mail.com",
    "gmx.com",
    "yandex.com",
    "",
    "gmail",
    ".example.com",
    "example.com.",
    "-example.com",
    "example-.com",
  ])("rejects %s", (domain) => {
    expect(isValidWorkspaceDomain(domain)).toBe(false);
  });

  it.each([
    "example.com",
    "team.example.com",
    "EXAMPLE.COM",
    "dittomail.com",
    "gmail-tools.com",
  ])("accepts %s", (domain) => {
    expect(isValidWorkspaceDomain(domain)).toBe(true);
  });
});
