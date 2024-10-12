import * as Popover from "@radix-ui/react-popover";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useState } from "react";

import { UnsubscribeLinkAttributes } from "./unsubscribeLink/utils";

function UnsubscribeLinkForm({
  linkText,
  updateAttributes,
  close,
}: {
  linkText: string;
  updateAttributes: NodeViewProps["updateAttributes"];
  close: () => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    close();
    e.preventDefault();
  };

  return (
    <form
      className="user-property-form p-2 bg-white border border-neutral-300 rounded-lg shadow-lg flex flex-row items-center space-x-4"
      onSubmit={handleSubmit}
    >
      <div>
        <label
          htmlFor="unsubscribe-link-form-link-text"
          className="block mb-2 text-sm font-medium text-gray-700"
        >
          Link Text
        </label>
        <input
          type="text"
          id="unsubscribe-link-form-link-text"
          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="Link Text"
          value={linkText}
          onChange={(e) => updateAttributes({ linkText: e.target.value })}
        />
      </div>
    </form>
  );
}

function UnsubscribeLinkComponent({ node, updateAttributes }: NodeViewProps) {
  const [visible, setVisible] = useState(true);
  const attribute = node.attrs as UnsubscribeLinkAttributes;

  return (
    <NodeViewWrapper className="user-property" as="span">
      <Popover.Root
        open={visible}
        onOpenChange={(open) => {
          setVisible(open);
        }}
      >
        <Popover.Trigger>
          <a style={{ textDecoration: "underline" }}>{attribute.linkText}</a>
        </Popover.Trigger>
        <Popover.Content autoFocus side="top">
          <UnsubscribeLinkForm
            close={() => setVisible(false)}
            linkText={attribute.linkText}
            updateAttributes={updateAttributes}
          />
        </Popover.Content>
      </Popover.Root>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    unsubscribeLink: {
      insertUnsubscribeLink: () => ReturnType;
    };
  }
}

export const UnsubscribeLink = Node.create({
  name: "unsubscribeLink",
  atom: true,
  group: "inline",
  isolating: true,
  inline: true,

  addAttributes() {
    return {
      linkText: {
        default: "unsubscribe",
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(UnsubscribeLinkComponent);
  },

  parseHTML() {
    return [
      {
        tag: "unsubscribe-link",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["unsubscribe-link", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertUnsubscribeLink:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
            })
            .blur()
            .run(),
    };
  },
});
