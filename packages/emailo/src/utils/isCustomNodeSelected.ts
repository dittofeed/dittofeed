import { Editor } from "@tiptap/core";
import { getExtensionNames } from "../tipTapExtensions";

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

const formattableCustomNodes = new Set(["unsubscribeLink"]);

export const isCustomNodeSelected = (editor: Editor, node: HTMLElement) => {
  const extensionIsActive = getExtensionNames().some(
    (extension) =>
      !formattableCustomNodes.has(extension) && editor.isActive(extension),
  );

  const isTableSelected = isTableGripSelected(node);
  return extensionIsActive || isTableSelected;
};

export default isCustomNodeSelected;
