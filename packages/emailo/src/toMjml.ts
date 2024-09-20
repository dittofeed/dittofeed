import { JSONContent } from "@tiptap/core";

function toMjmlHelper({
  content,
  parentType,
  childIndex = 0,
  isLastChild = false,
}: {
  content: JSONContent;
  parentType?: string;
  childIndex?: number;
  isLastChild?: boolean;
}): string {
  const resolvedContent: string = (
    content.content?.map((c, index) =>
      toMjmlHelper({
        content: c,
        parentType: content.type,
        childIndex: index,
        isLastChild: index === (content.content?.length ?? 1) - 1,
      }),
    ) ?? []
  ).join("");

  switch (content.type) {
    case "doc":
      return resolvedContent;
    case "text": {
      let text = content.text ?? "";
      let fontFamilyStyle = "";
      if (content.marks) {
        content.marks.forEach((mark) => {
          switch (mark.type) {
            case "bold":
              text = `<strong>${text}</strong>`;
              break;
            case "italic":
              text = `<em>${text}</em>`;
              break;
            case "textStyle":
              if (mark.attrs?.fontFamily) {
                fontFamilyStyle = `style="font-family: ${mark.attrs.fontFamily};"`;
              }
              break;
            // Add more mark types as needed
          }
        });
      }
      return fontFamilyStyle ? `<span ${fontFamilyStyle}>${text}</span>` : text;
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
    case "paragraph": {
      const style =
        childIndex === 0 || isLastChild
          ? 'style="margin: 0;"'
          : 'style="margin-top: 24px; margin-bottom: 24px;"';
      return `<mj-text><p ${style}>${resolvedContent}</p></mj-text>`;
    }
    case "bulletList":
      return `<mj-text><ul style="list-style-type: disc; padding-left: 32px; padding-right: 32px; margin-top: 8px; margin-bottom: 8px;">${resolvedContent}</ul></mj-text>`;
    case "listItem":
      return `<li style="margin-top: 4px; margin-bottom: 4px;">${resolvedContent}</li>`;
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
  const resolvedContent = toMjmlHelper({ content });
  // prettier-ignore
  // eslint-disable-next-line prefer-template
  return "<mjml>" +
    "<mj-head>" +
      "<mj-attributes>" +
        '<mj-all font-family="Arial, Helvetica, sans-serif" font-size="12pt" line-height="inherit" color="inherit" padding="0"/>' +
        '<mj-text line-height="1.5" />' +
      "</mj-attributes>" +
      "<mj-style>" +
        "pre { background-color: #f4f4f4; padding: 10px; border-radius: 4px; }" +
        "blockquote { border-left: 4px solid #ccc; padding-left: 16px; font-style: italic; }" +
      "</mj-style>" +
    "</mj-head>" +
    "<mj-body width=\"2400px\">" +
      "<mj-section full-width=\"full-width\">" +
        "<mj-column width=\"100%\">" + resolvedContent + "</mj-column>" +
      "</mj-section>" +
    "</mj-body>" +
  "</mjml>";
}
