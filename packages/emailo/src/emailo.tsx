import { Editor, EditorContent, useEditor } from "@tiptap/react";
import React from "react";

import { TextMenu } from "./components/textMenu";
import extensions from "./tipTapExtensions";
import { cn } from "./utils";

export interface EmailoState {
  editor: Editor;
}

export function useEmailo({ content }: { content: string }): EmailoState {
  const editor = useEditor({
    extensions,
    content,
  });
  if (!editor) {
    throw new Error("No editor found");
  }
  return { editor };
}

// eslint-disable-next-line react/require-default-props
export function Emailo({
  className,
  state,
}: {
  className?: string;
  state: EmailoState;
}) {
  return (
    <div className={cn("emailo", className)}>
      <EditorContent editor={state.editor} />
      {/* <ContentItemMenu editor={editor} /> */}
      <TextMenu editor={state.editor} />
    </div>
  );
}
