import { Group } from "./types";

export const GROUPS: Group[] = [
  {
    name: "format",
    title: "Format",
    commands: [
      {
        name: "heading1",
        label: "Heading 1",
        iconName: "Heading1",
        description: "High priority section title",
        aliases: ["h1"],
        action: (editor) => {
          editor.chain().focus().setHeading({ level: 1 }).run();
        },
      },
      {
        name: "heading2",
        label: "Heading 2",
        iconName: "Heading2",
        description: "Medium priority section title",
        aliases: ["h2"],
        action: (editor) => {
          editor.chain().focus().setHeading({ level: 2 }).run();
        },
      },
      {
        name: "heading3",
        label: "Heading 3",
        iconName: "Heading3",
        description: "Low priority section title",
        aliases: ["h3"],
        action: (editor) => {
          editor.chain().focus().setHeading({ level: 3 }).run();
        },
      },
      {
        name: "bulletList",
        label: "Bullet List",
        iconName: "List",
        description: "Unordered list of items",
        aliases: ["ul"],
        action: (editor) => {
          editor.chain().focus().toggleBulletList().run();
        },
      },
      {
        name: "numberedList",
        label: "Numbered List",
        iconName: "ListOrdered",
        description: "Ordered list of items",
        aliases: ["ol"],
        action: (editor) => {
          editor.chain().focus().toggleOrderedList().run();
        },
      },
      {
        name: "blockquote",
        label: "Blockquote",
        iconName: "Quote",
        description: "Element for quoting",
        action: (editor) => {
          editor.chain().focus().setBlockquote().run();
        },
      },
      {
        name: "codeBlock",
        label: "Code Block",
        iconName: "SquareCode",
        description: "Code block with syntax highlighting",
        shouldBeHidden: (editor) => editor.isActive("columns"),
        action: (editor) => {
          editor.chain().focus().setCodeBlock().run();
        },
      },
    ],
  },
  {
    name: "insert",
    title: "Insert",
    commands: [
      {
        name: "userProperty",
        label: "User Property",
        iconName: "User",
        description: "Insert a user property",
        action: (editor) => editor.chain().focus().setUserProperty().run(),
      },
      {
        name: "unsubscribeLink",
        label: "Unsubscribe Link",
        iconName: "Link",
        description: "Insert a link to unsubscribe from the subscription group",
        action: (editor) =>
          editor.chain().focus().insertUnsubscribeLink().run(),
      },
      {
        name: "horizontalRule",
        label: "Horizontal Rule",
        iconName: "Minus",
        description: "Insert a horizontal divider",
        aliases: ["hr"],
        action: (editor) => {
          editor.chain().focus().setHorizontalRule().run();
        },
      },
    ],
  },
];

export default GROUPS;
