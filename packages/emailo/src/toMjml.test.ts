import { Liquid } from "liquidjs";
import mjml2html from "mjml";

import { defaultEmailoContent } from "./emailo";
import { toMjml } from "./toMjml";

const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
  relativeReference: false,
});

liquidEngine.registerTag("unsubscribe_url", {
  render() {
    return "https://dittofeed.com";
  },
});

describe("toMjml", () => {
  it("should convert a JSONContent to an MJML string", () => {
    const mjmlString = toMjml({
      content: defaultEmailoContent,
      mode: "render",
    });

    expect(mjmlString).toContain("<mjml>");
    expect(mjmlString).toContain("<mj-body");
    expect(mjmlString).toContain("</mjml>");
  });

  it("should render MJML string to HTML", () => {
    const mjmlString = toMjml({
      content: defaultEmailoContent,
      mode: "render",
    });

    const result = mjml2html(mjmlString);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain("Hi there,");
  });

  it("should render MJML string to HTML with liquid processing", () => {
    const mjmlString = toMjml({
      content: defaultEmailoContent,
      mode: "render",
    });

    const user = { name: "John", email: "john@example.com" };
    const liquidRendered = liquidEngine.parseAndRenderSync(mjmlString, {
      user,
    }) as string;

    const result = mjml2html(liquidRendered);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain("https://dittofeed.com");
  });
});
