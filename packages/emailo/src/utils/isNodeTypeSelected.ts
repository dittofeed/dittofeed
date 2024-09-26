import { Editor } from "@tiptap/core";

export function isNodeTypeSelected(editor: Editor, nodeName: string): boolean {
  const { state } = editor;
  const { from, to } = state.selection;

  let hasNodeType = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === nodeName) {
      hasNodeType = true;
      return false; // Stop iteration
    }
    return true;
  });
  return hasNodeType;
}
