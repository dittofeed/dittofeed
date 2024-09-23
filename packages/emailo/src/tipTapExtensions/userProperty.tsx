import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React from "react";

interface UserPropertyAttributes {
  variableName: string;
}

function UserPropertyComponent({
  node,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  console.log("UserPropertyComponent");
  const attribute = node.attrs as UserPropertyAttributes;
  return (
    <NodeViewWrapper>
      <div>User Property: {attribute.variableName}</div>
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
  group: "block",
  // isolating: true,
  // inline: true,

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
        ({ chain }) => {
          console.log("loc2 setUserProperty", {
            name: this.name,
          });
          // return chain()
          //   .insertContent({
          //     type: "paragraph",
          //     content: [
          //       {
          //         type: "text",
          //         text: "User Property: myUserVariable",
          //       },
          //     ],
          //   })
          //   .run();
          return chain()
            .insertContent({
              type: this.name,
              attrs: { variableName: "myUserVariable" },
            })
            .run();
        },
    };
  },
});
