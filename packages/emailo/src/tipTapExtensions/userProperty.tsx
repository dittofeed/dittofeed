import * as Popover from "@radix-ui/react-popover";
import Tippy from "@tippyjs/react";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useState } from "react";

interface Property {
  name: string;
}

interface UserPropertyOptions {
  properties: Property[];
}

// https://flowbite.com/docs/forms/select/
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

function Select({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <form className="max-w-sm mx-auto">
      <label
        htmlFor={id}
        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <select
        id={id}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}

function UserPropertyForm({
  properties,
  variableName,
  getPos,
  updateAttributes,
}: {
  properties: Property[];
  variableName: string;
  getPos: NodeViewProps["getPos"];
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  const [visible, setVisible] = useState(true);
  // return (
  //   <Tippy
  //     visible={visible}
  //     placement="right"
  //     content={
  //       <div className="user-property-form p-2 bg-white border border-neutral-100 rounded-lg shadow-sm">
  //         <button type="button">foo</button>
  //         <Select
  //           id="user-property-select"
  //           label="User Property"
  //           options={properties.map((property) => ({
  //             value: property.name,
  //             label: property.name,
  //           }))}
  //         />
  //       </div>
  //     }
  //   >
  //     <span />
  //   </Tippy>
  // );
}

function UserPropertyComponent({
  node,
  getPos,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const attribute = node.attrs as UserPropertyAttributes;
  const properties: Property[] =
    editor.extensionManager.extensions.find(
      (extension) => extension.name === "userProperty",
    )?.options.properties || [];

  let body;
  if (attribute.step === "selected") {
    body = <UserPropertySelected variableName={attribute.variableName} />;
  } else {
    body = (
      <UserPropertyForm
        properties={properties}
        variableName={attribute.variableName}
        getPos={getPos}
        updateAttributes={updateAttributes}
      />
    );
  }
  return (
    <NodeViewWrapper className="user-property" as="span">
      {body}
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

export const UserProperty = Node.create<UserPropertyOptions>({
  name: "userProperty",
  atom: true,
  group: "inline",
  isolating: true,
  inline: true,

  addOptions() {
    return {
      properties: [],
    };
  },

  addAttributes() {
    return {
      variableName: {
        default: "myUserVariable",
      },
      step: {
        default: "selecting",
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
