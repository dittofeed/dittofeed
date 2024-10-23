import { Editor } from "@tiptap/core";

import { BlockquoteFigure } from "../tipTapExtensions/blockquoteFigure";
import { Link } from "../tipTapExtensions/link";
import { UserProperty } from "../tipTapExtensions/userProperty";

export const isTableGripSelected = (node: HTMLElement) => {
  let container = node;

  while (container && !["TD", "TH"].includes(container.tagName)) {
    container = container.parentElement!;
  }

  const gripColumn =
    container &&
    container.querySelector &&
    container.querySelector("a.grip-column.selected");
  const gripRow =
    container &&
    container.querySelector &&
    container.querySelector("a.grip-row.selected");

  if (gripColumn || gripRow) {
    return true;
  }

  return false;
};

const CUSTOM_NODES = [
  "codeBlock",
  "horizontalRule",
  Link.name,
  BlockquoteFigure.name,
  UserProperty.name,
];

export const isCustomNodeSelected = (editor: Editor, node: HTMLElement) => {
  const customNodeIsActive = CUSTOM_NODES.some((extension) =>
    editor.isActive(extension),
  );

  const isTableSelected = isTableGripSelected(node);
  return customNodeIsActive || isTableSelected;
};

export default isCustomNodeSelected;
