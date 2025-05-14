import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { Edit } from "@mui/icons-material";
import { IconButton, Stack, SxProps } from "@mui/material";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React, { useCallback, useEffect, useRef, useState } from "react";

import styles from "./editableName.module.css";

// ============================================
// 1) Define props interface
// ============================================
export interface EditableNameProps {
  /** Initial text for the title */
  text: string;
  /** Called when editing is finished (on blur) */
  onSubmit?: (finalText: string) => void;
  /** Whether the editor is disabled */
  disabled?: boolean;
}

// ============================================
// 2) Build a custom ProseMirror schema
// ============================================
const customSchema = new Schema({
  nodes: basicSchema.spec.nodes.update("paragraph", {
    ...basicSchema.spec.nodes.get("paragraph"),
    toDOM: () => ["p", { class: styles.textNode }, 0],
  }),
  marks: basicSchema.spec.marks,
});

// ============================================
// 3) reactStatePlugin
//    - Maintains { memorizedText: string } in plugin state
//    - Synchronized with React via .setMeta and useEffect
// ============================================
const reactStateKey = new PluginKey<ReactStatePluginData>("reactStateKey");

interface ReactStatePluginData {
  memorizedText: string;
}

function createReactStatePlugin(initialData: ReactStatePluginData) {
  return new Plugin<ReactStatePluginData>({
    key: reactStateKey,
    state: {
      init: () => initialData,
      apply: (tr, prevValue) => {
        const meta = tr.getMeta(reactStateKey);
        // If we dispatched a transaction with new data, use that
        if (meta) {
          return { ...prevValue, ...meta };
        }
        // Otherwise, keep old
        return prevValue;
      },
    },
  });
}

// ============================================
// 4) focusPlugin
//    - On focus: call a callback with the doc text to memorize
//    - On blur: call onSubmit with final text
//
//    *We wrap onBlurred in a microtask to avoid flushSync warnings.
// ============================================
const focusPluginKey = new PluginKey("focusPlugin");

function createFocusPlugin(
  onFocused: (currentText: string) => void,
  onBlurred: (finalText: string) => void,
) {
  return new Plugin({
    key: focusPluginKey,
    props: {
      handleDOMEvents: {
        focus: (view) => {
          onFocused(view.state.doc.textContent);
          return false; // allow default
        },
        blur: (view) => {
          // Defer the onSubmit callback to avoid flushSync warnings
          queueMicrotask(() => {
            onBlurred(view.state.doc.textContent);
          });
          return false; // allow default
        },
      },
    },
  });
}

// ============================================
// 5) singleLineKeymap
//    - Enter => blur
//    - Escape => if empty, revert to plugin memorizedText, then blur
// ============================================
function createSingleLineKeymap() {
  return keymap({
    Enter: (_state, _dispatch, view) => {
      // Defer blur
      queueMicrotask(() => {
        view?.dom.blur();
      });
      return true;
    },
    Escape: (state, dispatch, view) => {
      const currentText = state.doc.textContent.trim();
      if (!currentText) {
        // read memorized text from plugin state
        const pluginState = reactStateKey.getState(state);
        const revertText = pluginState?.memorizedText || "";
        // replace entire doc with memorized text
        const tr = state.tr.replaceWith(
          0,
          state.doc.content.size,
          state.schema.text(revertText),
        );
        dispatch?.(tr);
      }
      // Defer blur
      queueMicrotask(() => {
        view?.dom.blur();
      });
      return true;
    },
  });
}

// ============================================
// 6) storeViewRefPlugin
//    - Allows us to capture EditorView, so we can blur externally
// ============================================
const storeViewRefKey = new PluginKey("storeViewRefKey");

function createStoreViewRefPlugin(
  viewRef: React.MutableRefObject<EditorView | null>,
) {
  return new Plugin({
    key: storeViewRefKey,
    view: (editorView) => {
      // On plugin init, store the EditorView in ref
      viewRef.current = editorView;
      return {};
    },
  });
}

// ============================================
// 7) EditableNameV2 component
// ============================================
export function EditableNameV2({
  text,
  onSubmit,
  disabled,
}: EditableNameProps) {
  // ---------------------------------------------------
  // 7a) React state for memorizedText
  // ---------------------------------------------------
  const [memorizedText, setMemorizedText] = useState("");

  // ---------------------------------------------------
  // 7b) Ref for EditorView (needed for click-away blur)
  // ---------------------------------------------------
  const editorViewRef = useRef<EditorView | null>(null);

  // ---------------------------------------------------
  // 7c) Build initial doc
  // ---------------------------------------------------
  const safeText = text.trim().length ? text : "\u200B";
  const paragraph = customSchema.nodes.paragraph!.createAndFill(
    null,
    customSchema.text(safeText),
  );
  if (!paragraph) {
    throw new Error("Failed to create initial paragraph node.");
  }
  const initialDoc = customSchema.node("doc", null, [paragraph]);

  // ---------------------------------------------------
  // 7d) Create the ProseMirror plugins
  // ---------------------------------------------------
  // This plugin stores memorizedText, initially empty or ...
  const reactStatePlugin = createReactStatePlugin({ memorizedText: "" });

  // Focus plugin: memorizes text on focus, calls onSubmit on blur
  const focusPlugin = createFocusPlugin(
    (focusedText) => setMemorizedText(focusedText),
    (finalText) => {
      onSubmit?.(finalText);
    },
  );

  // Single-line keymap (Enter/Escape)
  const singleLine = createSingleLineKeymap();

  // Plugin that stores the EditorView in a ref
  const storeViewRef = createStoreViewRefPlugin(editorViewRef);

  // ---------------------------------------------------
  // 7e) Create EditorState
  // ---------------------------------------------------
  const [editorState, setEditorState] = useState(() =>
    EditorState.create({
      schema: customSchema,
      doc: initialDoc,
      plugins: [
        reactKeys(),
        singleLine,
        focusPlugin,
        reactStatePlugin,
        storeViewRef,
      ],
    }),
  );

  // ---------------------------------------------------
  // 7f) useEffect: whenever memorizedText changes in React,
  //     dispatch a transaction to update the plugin's state
  //     so the keymap can revert from it on Escape.
  // ---------------------------------------------------
  useEffect(() => {
    // Dispatch a tr that sets meta(reactStateKey, { memorizedText })
    queueMicrotask(() => {
      if (!editorViewRef.current) return;
      const { state, dispatch } = editorViewRef.current;
      const tr = state.tr.setMeta(reactStateKey, { memorizedText });
      dispatch(tr);
    });
  }, [memorizedText]);

  // ---------------------------------------------------
  // 7g) Dispatch function
  // ---------------------------------------------------
  const dispatchTransaction = (tr: Transaction) => {
    const newState = editorState.apply(tr);
    setEditorState(newState);
  };

  // ---------------------------------------------------
  // 7h) ClickAway => if editor is focused, blur (microtask)
  // ---------------------------------------------------
  const handleClickAway = () => {
    const view = editorViewRef.current;
    if (view?.hasFocus()) {
      // Defer the blur to avoid flushSync warnings
      queueMicrotask(() => {
        view.dom.blur();
      });
    }
  };

  const editable = useCallback(() => !disabled, [disabled]);

  // ---------------------------------------------------
  // 7i) Render
  // ---------------------------------------------------
  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <span>
        <ProseMirror
          state={editorState}
          editable={editable}
          dispatchTransaction={dispatchTransaction}
          attributes={{
            spellCheck: "false",
            role: "textbox",
            "aria-readonly": "false",
            "aria-multiline": "false",
            "aria-label": "name",
            translate: "no",
            class: styles.editor!, // Keep "!"
          }}
        >
          <ProseMirrorDoc />
        </ProseMirror>
      </span>
    </ClickAwayListener>
  );
}

export function EditableTitle(props: EditableNameProps & { sx?: SxProps }) {
  const { sx, ...rest } = props;
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ ...sx }}>
      <EditableNameV2 {...rest} />
      <IconButton size="small" onClick={() => {}}>
        <Edit sx={{ fontSize: "1rem" }} />
      </IconButton>
    </Stack>
  );
}
