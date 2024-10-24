import { mergeAttributes } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";

declare module "@tiptap/core" {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    directCodeBlock: {
      setDirectCodeBlock: () => ReturnType;
    };
  }
}

export const DirectCodeBlock = CodeBlock.extend({
  name: "directCodeBlock",

  addCommands() {
    return {
      setDirectCodeBlock:
        () =>
        ({ chain }) => {
          console.log("Executing setDirectCodeBlock command");
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                language: "html",
              },
              content: [
                {
                  type: "text",
                  text: "<div>Hello, world!</div>",
                },
              ],
            })
            .blur()
            .run();
        },
    };
  },
});
