import * as Popover from "@radix-ui/react-popover";
import Tippy from "@tippyjs/react";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useMemo, useState } from "react";

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
  defaultValue: string;
}

function UserPropertySelected({ variableName }: { variableName: string }) {
  const expression = variableName.includes(" ")
    ? `user['${variableName.replace(/'/g, "\\'")}']`
    : `user.${variableName}`;
  return <span>{`{{ ${expression} }} `}</span>;
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
    <>
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
    </>
  );
}

const FORM_DEFAULT_VALUE_ID = "user-property-form-default-value";

function UserPropertyFormContent({
  properties,
  variableName,
  defaultValue,
  updateAttributes,
}: {
  properties: Property[];
  variableName: string;
  defaultValue: string;
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  return (
    <form className="user-property-form p-2 bg-white border border-neutral-100 rounded-lg shadow-lg flex flex-row items-center space-x-4">
      <div>
        <Select
          id="user-property-select"
          label="User Property"
          options={properties.map((property) => ({
            value: property.name,
            label: property.name,
          }))}
        />
      </div>
      <div>
        <label
          htmlFor="user-property-form-default-value"
          className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
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

function UserPropertyForm({
  properties,
  variableName,
  defaultValue,
  updateAttributes,
}: {
  properties: Property[];
  variableName: string;
  defaultValue: string;
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  const [visible, setVisible] = useState(true);

  return (
    <Popover.Root defaultOpen>
      <Popover.Trigger asChild>
        <span className="user-property-form-trigger" />
      </Popover.Trigger>
      <Popover.Content autoFocus>
        <UserPropertyFormContent
          properties={properties}
          variableName={variableName}
          defaultValue={defaultValue}
          updateAttributes={updateAttributes}
        />
      </Popover.Content>
    </Popover.Root>
  );
}

function UserPropertyComponent({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const attribute = node.attrs as UserPropertyAttributes;
  const properties: Property[] = useMemo(
    () =>
      editor.extensionManager.extensions.find(
        (extension) => extension.name === "userProperty",
      )?.options.properties || [],
    [editor],
  );

  let body;
  if (attribute.step === "selected") {
    body = <UserPropertySelected variableName={attribute.variableName} />;
  } else {
    body = (
      <UserPropertyForm
        properties={properties}
        variableName={attribute.variableName}
        defaultValue={attribute.defaultValue}
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
              attrs: { variableName: "myUserVariable" },
            })
            .blur()
            .run(),
    };
  },
});
