import { JSONContent } from "@tiptap/core";

function toMjmlHelper({
  content,
  // parentType, // Removed unused parameter
  childIndex = 0,
  isLastChild = false,
}: {
  content: JSONContent;
  // parentType?: string; // Removed unused parameter
  childIndex?: number;
  isLastChild?: boolean;
}): string {
  const resolvedContent: string = (
    content.content?.map((c, index) =>
      toMjmlHelper({
        content: c,
        // Remove the parentType parameter
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
      const styles: string[] = [];
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
                styles.push(`font-family: ${mark.attrs.fontFamily}`);
              }
              if (mark.attrs?.fontSize) {
                styles.push(`font-size: ${mark.attrs.fontSize}`);
              }
              if (mark.attrs?.color) {
                styles.push(`color: ${mark.attrs.color}`);
              }
              break;
            case "link":
              text = `<a href="${mark.attrs?.href}" target="${mark.attrs?.target}" rel="${mark.attrs?.rel}">${text}</a>`;
              break;
            case "underline":
              text = `<u>${text}</u>`;
              break;
            case "strike":
              text = `<s>${text}</s>`;
              break;
            case "code":
              text = `<code>${text}</code>`;
              break;
            case "highlight":
              styles.push("background-color: yellow");
              break;
            case "superscript":
              text = `<sup>${text}</sup>`;
              break;
            case "subscript":
              text = `<sub>${text}</sub>`;
              break;
            // Add more mark types as needed
          }
        });
      }
      const styleAttr = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
      return styleAttr ? `<span${styleAttr}>${text}</span>` : text;
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
      return `<p style="font-size:${fontSize}; font-weight:bold; margin: 0;">${resolvedContent}</p>`;
    }
    case "paragraph": {
      const style =
        childIndex === 0 || isLastChild
          ? 'style="margin: 0;"'
          : 'style="margin-top: 24px; margin-bottom: 24px;"';
      return `<p ${style}>${resolvedContent}</p>`;
    }
    case "bulletList":
      return `<ul style="list-style-type: disc; padding-left: 32px; padding-right: 32px; margin-top: 32px; margin-bottom: 32px;">${resolvedContent}</ul>`;
    case "orderedList": {
      const start = content.attrs?.start ?? 1;
      return `<ol style="list-style-type: decimal; padding-left: 32px; padding-right: 32px; margin-top: 32px; margin-bottom: 32px;" start="${start}">${resolvedContent}</ol>`;
    }
    case "listItem":
      return `<li style="margin-top: 4px; margin-bottom: 4px;">${resolvedContent}</li>`;
    case "codeBlock":
      return `<pre style="background-color: #404040; color: white; padding: 16px; border-radius: 4px; margin-top: 48px; margin-bottom: 48px;"><code>${content.content?.[0]?.text ?? ""}</code></pre>`;
    case "blockquote":
      return `<blockquote>${resolvedContent}</blockquote>`;
    case "hardBreak":
      return "<br>";
    case "blockquoteFigure": {
      const quoteContent =
        content.content?.find((c) => c.type === "quote")?.content ?? [];
      const captionContent =
        content.content?.find((c) => c.type === "quoteCaption")?.content ?? [];

      const quoteText = quoteContent
        .map((c) => toMjmlHelper({ content: c }))
        .join("");
      const captionText = captionContent
        .map((c) => toMjmlHelper({ content: c }))
        .join("");

      // prettier-ignore
      // eslint-disable-next-line prefer-template
      return '<div style="border-left: 4px solid black; padding-left: 16px; padding-top: 8px; padding-bottom: 8px; margin-top: 56px; margin-bottom: 56px;">' +
        '<blockquote style="margin: 0; padding: 0; font-size: 18px; line-height: 1.5; color: #111827; font-size: inherit;">' +
          quoteText +
        '</blockquote>' +
        '<p style="margin-top: 16px; margin-bottom: 0; font-size: 14px; line-height: 1.25; color: #6b7280;">' +
          captionText +
        '</p>' +
      '</div>';
    }
    case "horizontalRule":
      return '<hr style="border: 0; border-top: 1px solid #e5e7eb; margin-top: 12px;" />';
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
    "</mj-head>" +
    "<mj-body width=\"2400px\">" +
      "<mj-section full-width=\"full-width\">" +
        "<mj-column width=\"100%\">" +
          "<mj-text>" +
            resolvedContent +
          "</mj-text>" +
        "</mj-column>" +
      "</mj-section>" +
    "</mj-body>" +
  "</mjml>";
}
