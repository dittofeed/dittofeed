import type { Editor } from "@tiptap/core";

export type { JSONContent as EmailoJsonContent } from "@tiptap/core";

export interface EmailoState {
  editor: Editor;
  customExtensions: string[];
}
