import CodeBlock from "@tiptap/extension-code-block";

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    markupBlock: {
      setMarkupBlock: () => ReturnType;
    };
  }
}

export const MarkupBlock = CodeBlock.extend({
  name: "markupBlock",

  addCommands() {
    return {
      setMarkupBlock:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: {
                language: "html",
              },
              content: [
                {
                  type: "text",
                  text: "liquid and mjml markup",
                },
              ],
            })
            .blur()
            .run(),
    };
  },
});
