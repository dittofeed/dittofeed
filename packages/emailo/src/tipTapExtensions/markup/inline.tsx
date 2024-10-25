import Code from "@tiptap/extension-code";

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    markupInline: {
      setMarkupInline: () => ReturnType;
    };
  }
}

export const MarkupInline = Code.extend({
  name: "markupInline",
  // less than default 100, for code inline
  priority: 90,

  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        renderHTML: () => ({
          class: "markup-inline markup-extension",
        }),
      },
    };
  },

  addCommands() {
    return {
      setMarkupInline:
        () =>
        ({ chain }) =>
          chain().setMark(this.name).run(),
    };
  },
});
