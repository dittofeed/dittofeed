import { JSONContent } from "@tiptap/core";

function toMjmlHelper(content: JSONContent): string {
  const resolvedContent: string = (
    content.content?.map((c) => toMjmlHelper(c)) ?? []
  ).join("");

  switch (content.type) {
    case "doc":
      return resolvedContent;
    case "text": {
      let text = content.text ?? "";
      if (content.marks) {
        content.marks.forEach((mark) => {
          switch (mark.type) {
            case "bold":
              text = `<strong>${text}</strong>`;
              break;
            case "italic":
              text = `<em>${text}</em>`;
              break;
            // Add more mark types as needed
          }
        });
      }
      return text;
    }
    case "heading": {
      let fontSize: string;
      let level: number;
      if (content.attrs?.level && typeof content.attrs.level === "number") {
        level = content.attrs.level;
      } else {
        level = 1;
      }
      switch (level) {
        case 1:
          fontSize = "32px";
          break;
        case 2:
          fontSize = "24px";
          break;
        case 3:
          fontSize = "20px";
          break;
        case 4:
          fontSize = "18px";
          break;
        case 5:
          fontSize = "16px";
          break;
        default:
          fontSize = "14px";
          break;
      }
      return `<mj-text font-size="${fontSize}" font-weight="bold">${resolvedContent}</mj-text>`;
    }
    case "paragraph":
      return `<mj-text>${resolvedContent}</mj-text>`;
    case "bulletList":
      return `<mj-text><ul style="list-style-type: disc; padding-left: 20px;">${resolvedContent}</ul></mj-text>`;
    case "listItem":
      return `<li>${resolvedContent}</li>`;
    case "codeBlock":
      return `<mj-text><pre><code>${content.content?.[0]?.text ?? ""}</code></pre></mj-text>`;
    case "blockquote":
      return `<mj-text><blockquote>${resolvedContent}</blockquote></mj-text>`;
    case "hardBreak":
      return "<br>";
    default:
      console.error("Unsupported node type", content.type, content);
      return "";
  }
}

export function toMjml({ content }: { content: JSONContent }): string {
  const resolvedContent = toMjmlHelper(content);
  // prettier-ignore
  // eslint-disable-next-line prefer-template
  return "<mjml>" +
    "<mj-head>" +
      "<mj-attributes>" +
        '<mj-all font-family="Arial, Helvetica, sans-serif" font-size="12pt" />' +
      "</mj-attributes>" +
      "<mj-style>" +
        "pre { background-color: #f4f4f4; padding: 10px; border-radius: 4px; }" +
        "blockquote { border-left: 4px solid #ccc; padding-left: 16px; font-style: italic; }" +
        "ul { margin: 0; }" +
      "</mj-style>" +
    "</mj-head>" +
    "<mj-body>" +
      "<mj-section>" +
        "<mj-column>" + resolvedContent + "</mj-column>" +
      "</mj-section>" +
    "</mj-body>" +
  "</mjml>";
}
