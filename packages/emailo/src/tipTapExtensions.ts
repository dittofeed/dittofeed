import { Extension, Mark, Node } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Highlight } from "@tiptap/extension-highlight";
import ListItem from "@tiptap/extension-list-item";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { BlockquoteFigure } from "./tipTapExtensions/blockquoteFigure";
import { FontSize } from "./tipTapExtensions/fontSize";
import { Image } from "./tipTapExtensions/image";
import { Link } from "./tipTapExtensions/link";
import { MarkupBlock } from "./tipTapExtensions/markup/block";
import { MarkupInline } from "./tipTapExtensions/markup/inline";
import { Selection } from "./tipTapExtensions/selection";
import { SlashCommand } from "./tipTapExtensions/slashCommand";
import { UnsubscribeLink } from "./tipTapExtensions/unsubscribeLink";
import { UserProperty } from "./tipTapExtensions/userProperty";
import { UserProperty as UserPropertyType } from "./tipTapExtensions/userProperty/utils";

type ExtensionOrMarkOrNode = Extension | Mark | Node;
let EXTENSIONS: ExtensionOrMarkOrNode[] | null = null;

export function getExtensionNames(): string[] {
  if (!EXTENSIONS) {
    throw new Error("Extensions not initialized");
  }
  return EXTENSIONS.map((ext) => ext.name);
}

export function getExtensions({
  userProperties,
}: {
  userProperties: UserPropertyType[];
}): ExtensionOrMarkOrNode[] {
  if (!EXTENSIONS) {
    EXTENSIONS = [
      Color.configure({ types: [TextStyle.name, ListItem.name] }),
      TextStyle.configure({ types: [ListItem.name] } as any),
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
        },
      }),
      SlashCommand,
      FontFamily.configure({
        fonts: ["Arial", "Helvetica", "sans-serif"],
      } as any),
      Typography,
      TextAlign.configure({
        types: ["paragraph", "heading"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Link,
      Underline,
      Highlight,
      FontSize,
      Subscript,
      Superscript,
      Selection,
      BlockquoteFigure,
      UserProperty.configure({
        properties: userProperties,
      }),
      UnsubscribeLink,
      MarkupBlock,
      MarkupInline,
      Image.configure({}),
    ];
  }
  return EXTENSIONS;
}
