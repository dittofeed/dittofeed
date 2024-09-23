import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React from "react";

interface UserPropertyAttributes {
  step: "selecting" | "selected";
  variableName: string;
}

function UserPropertySelected({ variableName }: { variableName: string }) {
  const expression = variableName.includes(" ")
    ? `user['${variableName.replace(/'/g, "\\'")}']`
    : `user.${variableName}`;
  return <span> {`{{ ${expression} }} `}</span>;
}

function UserPropertyForm({
  variableName,
  getPos,
  updateAttributes,
}: {
  variableName: string;
  getPos: NodeViewProps["getPos"];
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  return <span>{`{{ ${variableName} }}`}</span>;
}

function UserPropertyComponent({
  node,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const attribute = node.attrs as UserPropertyAttributes;
  return (
    <NodeViewWrapper className="user-property" as="span">
      User Property: {attribute.variableName}
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    userProperty: {
      setUserProperty: () => ReturnType;
    };
  }
}

export const UserProperty = Node.create<UserPropertyAttributes>({
  name: "userProperty",
  atom: true,
  group: "inline",
  isolating: true,
  inline: true,

  addAttributes() {
    return {
      variableName: {
        default: "myUserVariable",
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(UserPropertyComponent);
  },

  parseHTML() {
    return [
      {
        tag: "user-property",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["user-property", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setUserProperty:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { variableName: "myUserVariable" },
            })
            .run(),
    };
  },
});
