import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model"; // Only importing Schema now.
import { schema as basicSchema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import React, { useState } from "react";

import styles from "./editableName.module.css";

interface EditableNameProps {
  /** The initial text for the title */
  text: string;
  /** Optional callback that is called when the text changes */
  onChange?: (newText: string) => void;
}

// Build our custom schema using the modified nodes.
const customSchema = new Schema({
  nodes: basicSchema.spec.nodes.update("paragraph", {
    ...basicSchema.spec.nodes.get("paragraph"),
    toDOM: () => ["p", { class: styles.textNode }, 0],
  }),

  marks: basicSchema.spec.marks,
});

// Create a keymap plugin to intercept the Enter key so that the title remains a single line.
const singleLineKeymap = keymap({
  Enter: () => true,
});

/**
 * EditableNameV2 renders an editable title field using ProseMirror.
 * It initializes with a provided text and calls the onChange callback with the new text
 * whenever the document changes.
 */
export function EditableNameV2({ text, onChange }: EditableNameProps) {
  // Create an initial document with one paragraph containing the provided text.
  // Use createAndFill to ensure the paragraph content is valid.
  const safeText = text.trim().length ? text : "\u200b";

  const initialParagraph = customSchema.nodes.paragraph?.createAndFill(
    null,
    customSchema.text(safeText),
  );
  if (!initialParagraph) {
    throw new Error("Failed to create an initial paragraph node.");
  }
  const initialDoc = customSchema.node("doc", null, [initialParagraph]);

  // Create an EditorState with our custom schema, initial document, and plugins.
  const [editorState, setEditorState] = useState(() =>
    EditorState.create({
      schema: customSchema,
      doc: initialDoc,
      plugins: [reactKeys(), singleLineKeymap],
    }),
  );

  return (
    <ProseMirror
      state={editorState}
      dispatchTransaction={(tr) => {
        const newState = editorState.apply(tr);
        setEditorState(newState);
        if (onChange) {
          onChange(newState.doc.textContent);
        }
      }}
      // Pass attributes to the editor container using our CSS module class.
      attributes={{
        spellCheck: "true",
        role: "textbox",
        "aria-readonly": "false",
        "aria-multiline": "false",
        "aria-label": "Issue title",
        translate: "no",
        class: styles.editor!,
      }}
    >
      <ProseMirrorDoc />
    </ProseMirror>
  );
}
