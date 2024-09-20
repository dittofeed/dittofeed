import mjml2html from "mjml";

function mjmlToHtml(html: string) {
  const result = mjml2html(html);
  console.log("loc0", html);
  console.log("loc1", result.html);
  if (result.errors.length > 0) {
    console.error("mjml result.errors", result.errors);
    throw new Error(JSON.stringify(result.errors));
  }
  return result.html;
}

export const serverFunctions = { mjmlToHtml };
