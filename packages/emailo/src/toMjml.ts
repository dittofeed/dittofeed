import { JSONContent } from "@tiptap/core";

import { ImageAttributes } from "./tipTapExtensions/image";
import { UnsubscribeLinkAttributes } from "./tipTapExtensions/unsubscribeLink/utils";
import {
  UserPropertyAttributes,
  userPropertyToExpression,
} from "./tipTapExtensions/userProperty/utils";

type Mode = "preview" | "render";

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

// Updated function with named parameters
function applyTextStyles({
  text,
  marks,
  defaultTextStyles,
}: {
  text: string;
  marks?: Mark[];
  defaultTextStyles?: Record<string, string>;
}): {
  styledText: string;
  styles: string[];
} {
  // Check if there's a markup inline mark
  const hasMarkupInline = marks?.some((mark) => mark.type === "markupInline");
  if (hasMarkupInline) {
    // Return raw text without any styling when markup inline is present
    return {
      styledText: text,
      styles: [],
    };
  }

  let styledText = text;
  const styles: string[] = [];

  marks?.forEach((mark) => {
    switch (mark.type) {
      case "bold":
        styledText = `<strong>${styledText}</strong>`;
        break;
      case "italic":
        styledText = `<em>${styledText}</em>`;
        break;
      case "textStyle": {
        const fontFamily =
          mark.attrs?.fontFamily ?? defaultTextStyles?.fontFamily;
        if (fontFamily) {
          styles.push(`font-family: ${fontFamily}`);
        }
        const fontSize = mark.attrs?.fontSize ?? defaultTextStyles?.fontSize;
        if (fontSize) {
          styles.push(`font-size: ${fontSize}`);
        }
        const color = mark.attrs?.color ?? defaultTextStyles?.color;
        if (color) {
          styles.push(`color: ${color}`);
        }
        break;
      }
      case "link":
        styledText = `<a href="${mark.attrs?.href}" target="${mark.attrs?.target}" rel="${mark.attrs?.rel}" style="color: inherit; text-decoration: underline;">${styledText}</a>`;
        break;
      case "underline":
        styledText = `<u>${styledText}</u>`;
        break;
      case "strike":
        styledText = `<s>${styledText}</s>`;
        break;
      case "code":
        styledText = `<code style="background-color: #171717; border-radius: 2px; color: white;">${styledText}</code>`;
        break;
      case "highlight":
        styles.push("background-color: yellow");
        break;
      case "superscript":
        styledText = `<sup>${styledText}</sup>`;
        break;
      case "subscript":
        styledText = `<sub>${styledText}</sub>`;
        break;
      // Add more mark types as needed
    }
  });

  return { styledText, styles };
}

function toMjmlHelper({
  content,
  childIndex = 0,
  isLastChild = false,
  mode,
}: {
  content: JSONContent;
  childIndex?: number;
  isLastChild?: boolean;
  mode: Mode;
}): string {
  const resolvedContent: string = (
    content.content?.map((c, index) =>
      toMjmlHelper({
        content: c,
        childIndex: index,
        isLastChild: index === (content.content?.length ?? 1) - 1,
        mode,
      }),
    ) ?? []
  ).join("");

  switch (content.type) {
    case "doc":
      return resolvedContent;
    case "text": {
      const { styledText, styles } = applyTextStyles({
        text: content.text ?? "",
        marks: content.marks ?? [],
      });
      const styleAttr = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
      return styleAttr ? `<span${styleAttr}>${styledText}</span>` : styledText;
    }
    case "heading": {
      let fontSize: string;
      let lineHeight: string;
      const level = content.attrs?.level ?? 1;

      switch (level) {
        case 1:
          fontSize = "30px";
          lineHeight = "36px";
          break;
        case 2:
          fontSize = "24px";
          lineHeight = "32px";
          break;
        case 3:
          fontSize = "20px";
          lineHeight = "28px";
          break;
        case 4:
          fontSize = "18px";
          lineHeight = "28px";
          break;
        case 5:
          fontSize = "16px";
          lineHeight = "24px";
          break;
        case 6:
          fontSize = "14px";
          lineHeight = "20px";
          break;
        default:
          fontSize = "16px";
          lineHeight = "24px";
          break;
      }

      // Pass heading attributes to paragraph case
      return toMjmlHelper({
        content: {
          type: "paragraph",
          attrs: {
            ...content.attrs,
            fontSize,
            lineHeight,
            fontWeight: "bold",
          },
          content: content.content,
        },
        childIndex,
        isLastChild,
        mode,
      });
    }
    case "paragraph": {
      const style = [
        childIndex === 0 || isLastChild
          ? "margin: 0;"
          : "margin-top: 24px; margin-bottom: 24px;",
      ];

      if (content.attrs?.textAlign) {
        style.push(`text-align: ${content.attrs.textAlign};`);
      }

      if (content.attrs?.fontSize) {
        style.push(`font-size: ${content.attrs.fontSize};`);
      }

      if (content.attrs?.lineHeight) {
        style.push(`line-height: ${content.attrs.lineHeight};`);
      }

      if (content.attrs?.fontWeight) {
        style.push(`font-weight: ${content.attrs.fontWeight};`);
      }

      if (content.attrs?.margin) {
        style.push(`margin: ${content.attrs.margin};`);
      }

      const styleAttr = `style="${style.join(" ")}"`;

      // Ensure empty paragraphs are rendered
      const paragraphContent = resolvedContent || "<br>";

      return `<p ${styleAttr}>${paragraphContent}</p>`;
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
        .map((c) => toMjmlHelper({ content: c, mode }))
        .join("");
      const captionText = captionContent
        .map((c) => toMjmlHelper({ content: c, mode }))
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
    case "userProperty": {
      const { variableName, defaultValue } =
        content.attrs as UserPropertyAttributes;

      const expression = userPropertyToExpression({
        variableName,
        defaultValue,
      });
      switch (mode) {
        case "preview":
          return `<code style="background-color: #171717; border-radius: 2px; color: white;">${expression}</code>`;
        case "render":
          return expression;
      }
      break;
    }
    case "unsubscribeLink": {
      const { linkText } = content.attrs as UnsubscribeLinkAttributes;
      const marks = content.marks ?? []; // Include existing marks
      return toMjmlHelper({
        content: {
          type: "text",
          text: linkText,
          marks: [
            ...marks, // Preserve existing marks
            {
              type: "link",
              attrs: {
                href: "{% unsubscribe_url %}",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ],
        },
        mode,
      });
    }
    case "markupBlock": {
      return content.content?.[0]?.text ?? "";
    }
    case "markupInline": {
      return content.content?.[0]?.text ?? "";
    }
    case "dfImage": {
      const { url, alt, width } = content.attrs as ImageAttributes;
      return `<img src="${url}" alt="${alt}" width="${width}px"></img>`;
    }
    default:
      console.error("Unsupported node type", content.type, content);
      return "";
  }
}

export function toMjml({
  content,
  mode,
}: {
  content: JSONContent;
  mode: Mode;
}): string {
  const resolvedContent = toMjmlHelper({ content, mode });
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
