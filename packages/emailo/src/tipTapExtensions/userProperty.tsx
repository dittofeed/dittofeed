import * as Popover from "@radix-ui/react-popover";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useMemo, useState } from "react";

import {
  UserProperty as UserPropertyType,
  UserPropertyAttributes,
  UserPropertyOptions,
  userPropertyToExpression,
} from "./userProperty/utils";

function UserPropertySelected({
  variableName,
  defaultValue,
}: {
  variableName: string;
  defaultValue: string;
}) {
  return (
    <code className="underline inline">
      {userPropertyToExpression({ variableName, defaultValue })}
    </code>
  );
}

function Select({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className="block mb-2 text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <select
        id={id}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

function UserPropertyFormContent({
  properties,
  variableName,
  defaultValue,
  updateAttributes,
  close,
}: {
  properties: UserPropertyType[];
  variableName: string;
  defaultValue: string;
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
        <Select
          id="user-property-select"
          label="User Property"
          options={properties.map((property) => ({
            value: property.name,
            label: property.name,
          }))}
          value={variableName}
          onChange={(value) => updateAttributes({ variableName: value })}
        />
      </div>
      <div>
        <label
          htmlFor="user-property-form-default-value"
          className="block mb-2 text-sm font-medium text-gray-700"
        >
          Default Value
        </label>
        <input
          type="text"
          id="user-property-form-default-value"
          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="Default Value"
          value={defaultValue}
          onChange={(e) => updateAttributes({ defaultValue: e.target.value })}
        />
      </div>
    </form>
  );
}

function UserPropertyComponent({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const [visible, setVisible] = useState(true);
  const attribute = node.attrs as UserPropertyAttributes;
  const properties = useMemo(
    () =>
      editor.extensionManager.extensions.find((e) => e.name === "userProperty")
        ?.options.properties || [],
    [editor],
  );

  return (
    <NodeViewWrapper className="user-property" as="span">
      <Popover.Root
        open={visible}
        onOpenChange={(open) => {
          setVisible(open);
        }}
      >
        <Popover.Trigger>
          <UserPropertySelected
            variableName={attribute.variableName}
            defaultValue={attribute.defaultValue}
          />
        </Popover.Trigger>
        <Popover.Content autoFocus side="top">
          <UserPropertyFormContent
            properties={properties}
            close={() => setVisible(false)}
            variableName={attribute.variableName}
            defaultValue={attribute.defaultValue}
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
      properties: [
        {
          name: "myUserProperty",
        },
      ],
    };
  },

  addAttributes() {
    return {
      variableName: {
        default: this.options.properties[0]?.name ?? "",
      },
      defaultValue: {
        default: "",
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
            })
            .blur()
            .run(),
    };
  },
});
