import { resolveApiBase, ResolveApiBaseParams } from "./apiBase";
import { NodeEnvEnum } from "./types";

describe("resolveApiBase", () => {
  const baseParams: ResolveApiBaseParams = {
    authMode: "anonymous",
    dashboardUrl: "http://localhost:3000",
    nodeEnv: NodeEnvEnum.Production,
  };

  it("returns dashboardApiBase when set", () => {
    const result = resolveApiBase({
      ...baseParams,
      dashboardApiBase: "http://custom-api.example.com",
    });
    expect(result).toBe("http://custom-api.example.com");
  });

  it("returns dashboardApiName when set", () => {
    const result = resolveApiBase({
      ...baseParams,
      dashboardApiName: "http://from-name.example.com",
    });
    expect(result).toBe("http://from-name.example.com");
  });

  it("dashboardApiBase takes precedence over dashboardApiName", () => {
    const result = resolveApiBase({
      ...baseParams,
      dashboardApiBase: "http://from-base.example.com",
      dashboardApiName: "http://from-name.example.com",
    });
    expect(result).toBe("http://from-base.example.com");
  });

  describe("domain construction", () => {
    it("constructs URL from domain with defaults", () => {
      const result = resolveApiBase({
        ...baseParams,
        dashboardApiDomain: "example.com",
      });
      expect(result).toBe("https://example.com:3001");
    });

    it("includes subdomain when provided", () => {
      const result = resolveApiBase({
        ...baseParams,
        dashboardApiDomain: "example.com",
        dashboardApiSubdomain: "api",
      });
      expect(result).toBe("https://api.example.com:3001");
    });

    it("uses custom protocol when provided", () => {
      const result = resolveApiBase({
        ...baseParams,
        dashboardApiDomain: "example.com",
        dashboardApiProtocol: "http",
      });
      expect(result).toBe("http://example.com:3001");
    });

    it("uses custom port when provided", () => {
      const result = resolveApiBase({
        ...baseParams,
        dashboardApiDomain: "example.com",
        dashboardApiPort: "8080",
      });
      expect(result).toBe("https://example.com:8080");
    });

    it("uses all custom domain parts", () => {
      const result = resolveApiBase({
        ...baseParams,
        dashboardApiDomain: "example.com",
        dashboardApiSubdomain: "api",
        dashboardApiProtocol: "http",
        dashboardApiPort: "8080",
      });
      expect(result).toBe("http://api.example.com:8080");
    });
  });

  it("returns dashboardUrl in single-tenant mode", () => {
    const result = resolveApiBase({
      ...baseParams,
      authMode: "single-tenant",
      dashboardUrl: "https://my-app.example.com",
    });
    expect(result).toBe("https://my-app.example.com");
  });

  it("returns localhost:3001 in development mode", () => {
    const result = resolveApiBase({
      ...baseParams,
      nodeEnv: NodeEnvEnum.Development,
    });
    expect(result).toBe("http://localhost:3001");
  });

  it("returns empty string as fallback in production", () => {
    const result = resolveApiBase({
      ...baseParams,
      nodeEnv: NodeEnvEnum.Production,
    });
    expect(result).toBe("");
  });

  describe("precedence order", () => {
    it("dashboardApiBase > dashboardApiName > domain > single-tenant > development", () => {
      // All options set - dashboardApiBase wins
      expect(
        resolveApiBase({
          dashboardApiBase: "http://base.example.com",
          dashboardApiName: "http://name.example.com",
          dashboardApiDomain: "domain.example.com",
          authMode: "single-tenant",
          dashboardUrl: "http://dashboard.example.com",
          nodeEnv: NodeEnvEnum.Development,
        }),
      ).toBe("http://base.example.com");

      // Without dashboardApiBase - dashboardApiName wins
      expect(
        resolveApiBase({
          dashboardApiName: "http://name.example.com",
          dashboardApiDomain: "domain.example.com",
          authMode: "single-tenant",
          dashboardUrl: "http://dashboard.example.com",
          nodeEnv: NodeEnvEnum.Development,
        }),
      ).toBe("http://name.example.com");

      // Without dashboardApiBase and dashboardApiName - domain wins
      expect(
        resolveApiBase({
          dashboardApiDomain: "domain.example.com",
          authMode: "single-tenant",
          dashboardUrl: "http://dashboard.example.com",
          nodeEnv: NodeEnvEnum.Development,
        }),
      ).toBe("https://domain.example.com:3001");

      // Without explicit config - single-tenant wins
      expect(
        resolveApiBase({
          authMode: "single-tenant",
          dashboardUrl: "http://dashboard.example.com",
          nodeEnv: NodeEnvEnum.Development,
        }),
      ).toBe("http://dashboard.example.com");

      // Without single-tenant - development wins
      expect(
        resolveApiBase({
          authMode: "anonymous",
          dashboardUrl: "http://dashboard.example.com",
          nodeEnv: NodeEnvEnum.Development,
        }),
      ).toBe("http://localhost:3001");
    });
  });
});
