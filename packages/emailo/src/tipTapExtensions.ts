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
import { Link } from "./tipTapExtensions/link";
import { Selection } from "./tipTapExtensions/selection";
import { SlashCommand } from "./tipTapExtensions/slashCommand";
import { UserProperty } from "./tipTapExtensions/userProperty";

const extensions = [
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
  }),
  Typography,
  TextAlign,
  Link,
  Underline,
  Highlight,
  FontSize,
  Subscript,
  Superscript,
  Selection,
  BlockquoteFigure,
  UserProperty.configure({
    properties: [{ name: "name" }, { name: "age" }, { name: "family name" }],
  }),
];

export default extensions;
