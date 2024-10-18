import { useEditor, UseEditorOptions } from "@tiptap/react";

import { getExtensions } from "./tipTapExtensions";
import { UserProperty } from "./tipTapExtensions/userProperty/utils";
import { EmailoJsonContent, EmailoState } from "./types";

export function useEmailo({
  content,
  userProperties,
  onUpdate,
}: {
  content: string | EmailoJsonContent;
  userProperties: UserProperty[];
  onUpdate?: UseEditorOptions["onUpdate"];
}): EmailoState | null {
  const extensions = getExtensions({ userProperties });
  const editor = useEditor({
    extensions,
    content,
    onUpdate,
    immediatelyRender: false,
  });
  if (!editor) {
    return null;
  }
  return { editor };
}
