import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
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

// Create a custom schema by updating the paragraph node so that it renders a <p>
// element with the CSS module class for our text node.
const customNodes = basicSchema.spec.nodes.update("paragraph", () => {
  const paragraphSpec = basicSchema.spec.nodes.get("paragraph");
  return {
    ...paragraphSpec,
    toDOM() {
      return ["p", { class: styles.textNode }, 0];
    },
  };
});

const customSchema = new Schema({
  nodes: customNodes,
  marks: basicSchema.spec.marks,
});

// Create a keymap plugin to intercept the Enter key so that the title remains a single line.
const singleLineKeymap = keymap({
  Enter: () => true,
});

/**
 * EditableName renders an editable title field using ProseMirror.
 * It initializes with a provided text and calls the onChange callback with the new text
 * whenever the document changes.
 */
function EditableName({ text, onChange }: EditableNameProps) {
  // Create an initial document with one paragraph containing the provided text.
  const initialDoc = customSchema.node("doc", null, [
    customSchema.node("paragraph", null, customSchema.text(text)),
  ]);

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
        class: styles.editor,
      }}
    >
      <ProseMirrorDoc />
    </ProseMirror>
  );
}

export default EditableName;
