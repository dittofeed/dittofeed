import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useState } from "react";

import { ImageAttributes, ImageOptions } from "./image/types";

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    dfImage: {
      setDfImage: () => ReturnType;
    };
  }
}

function ImageForm({
  width,
  url,
  alt,
  updateAttributes,
}: ImageOptions & {
  updateAttributes: (attrs: Partial<ImageOptions>) => void;
}) {
  return (
    <div className="p-2 bg-white border border-neutral-300 rounded-lg shadow-lg space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => updateAttributes({ url: e.target.value })}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Alt Text</label>
        <input
          type="text"
          value={alt}
          onChange={(e) => updateAttributes({ alt: e.target.value })}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Width: {width}px</label>
        <Slider.Root
          className="relative flex items-center w-full h-5"
          value={[width]}
          max={800}
          min={100}
          step={10}
          onValueChange={([value]) => updateAttributes({ width: value })}
        >
          <Slider.Track className="relative h-1 w-full grow rounded-full bg-gray-200">
            <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
          </Slider.Track>
          <Slider.Thumb
            className="block h-4 w-4 rounded-full bg-blue-500 shadow-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Width"
          />
        </Slider.Root>
      </div>
    </div>
  );
}

function ImageComponent({ node, updateAttributes }: NodeViewProps) {
  const attribute = node.attrs as ImageAttributes;
  const [visible, setVisible] = useState(attribute.defaultOpen);

  return (
    <NodeViewWrapper as="span">
      <Popover.Root
        open={visible}
        onOpenChange={(open) => {
          setVisible(open);
        }}
      >
        <Popover.Trigger>
          <img
            src={attribute.url}
            alt={attribute.alt}
            style={{
              width: `${attribute.width}px`,
              height: "auto",
            }}
          />
        </Popover.Trigger>
        <Popover.Content autoFocus side="top">
          <ImageForm
            width={attribute.width}
            url={attribute.url}
            alt={attribute.alt}
            updateAttributes={updateAttributes}
          />
        </Popover.Content>
      </Popover.Root>
    </NodeViewWrapper>
  );
}

export const Image = Node.create({
  name: "dfImage",
  group: "block",
  atom: true,
  isolating: true,

  addOptions() {},

  addAttributes() {
    return {
      url: {
        default: "https://storage.googleapis.com/dittofeed-public/logo.png",
      },
      alt: {
        default: "",
      },
      defaultOpen: {
        default: false,
      },
      width: {
        default: 300,
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },

  parseHTML() {
    return [
      {
        tag: "df-image",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["df-image", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setDfImage:
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
