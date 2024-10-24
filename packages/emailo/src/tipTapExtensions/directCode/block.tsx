import * as Popover from "@radix-ui/react-popover";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useMemo, useState } from "react";

import {
  DirectCodeBlock as DirectCodeBlockType,
  DirectCodeBlockAttributes,
  DirectCodeBlockOptions,
  directCodeBlockToExpression,
} from "../directCodeBlock/utils";

function DirectCodeBlockSelected({
  variableName,
  defaultValue,
}: {
  variableName: string;
  defaultValue: string;
}) {
  return (
    <code className="underline inline">
      {directCodeBlockToExpression({ variableName, defaultValue })}
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

function DirectCodeBlockFormContent({
  properties,
  variableName,
  defaultValue,
  updateAttributes,
  close,
}: {
  properties: DirectCodeBlockType[];
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
      className="direct-code-block-form p-2 bg-white border border-neutral-300 rounded-lg shadow-lg flex flex-row items-center space-x-4"
      onSubmit={handleSubmit}
    >
      <div>
        <Select
          id="direct-code-block-select"
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
          htmlFor="direct-code-block-form-default-value"
          className="block mb-2 text-sm font-medium text-gray-700"
        >
          Default Value
        </label>
        <input
          type="text"
          id="direct-code-block-form-default-value"
          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          placeholder="Default Value"
          value={defaultValue}
          onChange={(e) => updateAttributes({ defaultValue: e.target.value })}
        />
      </div>
    </form>
  );
}

function DirectCodeBlockComponent({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const attribute = node.attrs as DirectCodeBlockAttributes;
  const [visible, setVisible] = useState(attribute.defaultOpen);
  const properties = useMemo(
    () =>
      editor.extensionManager.extensions.find(
        (e) => e.name === "directCodeBlock",
      )?.options.properties || [],
    [editor],
  );

  return (
    <NodeViewWrapper className="direct-code-block" as="span">
      <Popover.Root
        open={visible}
        onOpenChange={(open) => {
          setVisible(open);
        }}
      >
        <Popover.Trigger>
          <DirectCodeBlockSelected
            variableName={attribute.variableName}
            defaultValue={attribute.defaultValue}
          />
        </Popover.Trigger>
        <Popover.Content autoFocus side="top">
          <DirectCodeBlockFormContent
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
    directCodeBlock: {
      setDirectCodeBlock: () => ReturnType;
    };
  }
}

export const DirectCodeBlock = Node.create<DirectCodeBlockOptions>({
  name: "directCodeBlock",
  atom: true,
  group: "inline",
  isolating: true,
  inline: true,

  addOptions() {
    return {
      properties: [
        {
          name: "myDirectCodeBlock",
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
      defaultOpen: {
        default: false,
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DirectCodeBlockComponent);
  },

  parseHTML() {
    return [
      {
        tag: "direct-code-block",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["direct-code-block", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setDirectCodeBlock:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: {
                defaultOpen: true,
              },
            })
            .blur()
            .run(),
    };
  },
});
