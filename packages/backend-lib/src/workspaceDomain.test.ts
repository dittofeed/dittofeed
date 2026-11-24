import {
  isValidWorkspaceDomain,
  isValidWorkspaceDomainList,
  parseWorkspaceDomains,
} from "./workspaceDomain";

describe("parseWorkspaceDomains", () => {
  it("returns an empty list for empty values", () => {
    expect(parseWorkspaceDomains(null)).toEqual([]);
    expect(parseWorkspaceDomains(undefined)).toEqual([]);
    expect(parseWorkspaceDomains("")).toEqual([]);
    expect(parseWorkspaceDomains(" , ")).toEqual([]);
  });

  it("splits, trims, lowercases, and deduplicates", () => {
    expect(parseWorkspaceDomains("Example.com, subsidiary.COM")).toEqual([
      "example.com",
      "subsidiary.com",
    ]);
    expect(parseWorkspaceDomains("example.com example.com")).toEqual([
      "example.com",
    ]);
  });
});

describe("isValidWorkspaceDomainList", () => {
  it.each([
    "example.com",
    "example.com,subsidiary.com",
    "a.com, b.com",
    " a.com ,b.com ",
    "example.com,",
  ])("accepts %s", (value) => {
    expect(isValidWorkspaceDomainList(value)).toBe(true);
  });

  it.each([
    "",
    " , ",
    "gmail.com",
    "example.com,gmail.com",
    "example.com,nope",
  ])("rejects %s", (value) => {
    expect(isValidWorkspaceDomainList(value)).toBe(false);
  });
});

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
