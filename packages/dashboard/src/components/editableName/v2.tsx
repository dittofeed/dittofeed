import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import React, { useState } from "react";

import styles from "./editableName.module.css";

interface EditableNameProps {
  /** The initial text for the title */
  text: string;
  /** Called when editing is finished (on blur) */
  onSubmit?: (finalText: string) => void;
}

/**
 * 1) Build a custom schema, modifying the paragraph node to attach custom CSS.
 */
const customSchema = new Schema({
  nodes: basicSchema.spec.nodes.update("paragraph", {
    ...basicSchema.spec.nodes.get("paragraph"),
    toDOM: () => ["p", { class: styles.textNode }, 0],
  }),
  marks: basicSchema.spec.marks,
});

/**
 * 2) Create a single-line keymap, so Enter/Escape blur the editor
 *    rather than adding new lines or continuing editing.
 */
const singleLineKeymap = keymap({
  Enter: (_state, _dispatch, view) => {
    // Force blur on Enter
    view?.dom.blur();
    return true;
  },
  Escape: (_state, _dispatch, view) => {
    // Force blur on Escape
    view?.dom.blur();
    return true;
  },
});

/**
 * 3) Create a focus plugin to intercept DOM focus/blur events
 *    and call onSubmit when the editor loses focus.
 */
const focusPluginKey = new PluginKey("focusPlugin");

function createFocusPlugin(onSubmit?: (finalText: string) => void) {
  return new Plugin({
    key: focusPluginKey,
    props: {
      handleDOMEvents: {
        blur: (view) => {
          if (onSubmit) {
            onSubmit(view.state.doc.textContent);
          }
          // Return false so ProseMirror continues default handling,
          // but we've already invoked onSubmit.
          return false;
        },
      },
    },
  });
}

/**
 * 4) EditableNameV2: A single-line ProseMirror editor that
 *    calls onSubmit when it loses focus.
 */
export function EditableNameV2({ text, onSubmit }: EditableNameProps) {
  // Prevent empty doc by using a zero-width space if `text` is empty
  const safeText = text.trim().length ? text : "\u200B";

  // Create an initial ProseMirror doc with one paragraph
  const initialParagraph = customSchema.nodes.paragraph?.createAndFill(
    null,
    customSchema.text(safeText),
  );
  if (!initialParagraph) {
    throw new Error("Failed to create an initial paragraph node.");
  }
  const initialDoc = customSchema.node("doc", null, [initialParagraph]);

  // Create an EditorState with our schema, doc, and plugins
  const [editorState, setEditorState] = useState(() =>
    EditorState.create({
      schema: customSchema,
      doc: initialDoc,
      plugins: [
        reactKeys(),
        singleLineKeymap,
        createFocusPlugin(onSubmit), // the focus plugin triggers onSubmit on blur
      ],
    }),
  );

  return (
    <ProseMirror
      state={editorState}
      dispatchTransaction={(tr) => {
        const newState = editorState.apply(tr);
        setEditorState(newState);
      }}
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
