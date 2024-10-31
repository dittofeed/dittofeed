import { EditorContent, useEditor, UseEditorOptions } from "@tiptap/react";
import React from "react";

import { TextMenu } from "./components/textMenu";
import { getExtensions } from "./tipTapExtensions";
import { UserProperty } from "./tipTapExtensions/userProperty/utils";
import { EmailoJsonContent, EmailoState } from "./types";
import { cn } from "./utils";

export { toMjml } from "./toMjml";
export * from "./types";

export function useEmailo({
  content,
  userProperties,
  onUpdate,
  disabled,
}: {
  content: string | EmailoJsonContent;
  userProperties: UserProperty[];
  onUpdate?: UseEditorOptions["onUpdate"];
  disabled?: boolean;
}): EmailoState | null {
  const extensions = getExtensions({ userProperties });
  const editor = useEditor({
    extensions,
    content,
    onUpdate,
    editable: !disabled,
    immediatelyRender: false,
  });
  if (!editor) {
    return null;
  }
  return { editor };
}

// eslint-disable-next-line react/require-default-props
export function Emailo({
  className,
  state,
  disabled,
}: {
  className?: string;
  state: EmailoState;
  disabled?: boolean;
}) {
  return (
    <div className={cn("emailo", className)}>
      <EditorContent editor={state.editor} readOnly={disabled} />
      {!disabled && <TextMenu state={state} />}
      <span className="emailo-tippy" />
    </div>
  );
}

export const defaultEmailoContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: {
        level: 2,
      },
      content: [
        {
          type: "text",
          text: "Hi there,",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "this is a ",
        },
        {
          type: "text",
          marks: [
            {
              type: "italic",
            },
          ],
          text: "basic",
        },
        {
          type: "text",
          text: " example of ",
        },
        {
          type: "text",
          marks: [
            {
              type: "bold",
            },
          ],
          text: "Dittofeed’s Low Code Email Editor",
        },
        {
          type: "text",
          text: ". ",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "Type “/” to open the command menu to create new blocks.",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "Use these blocks format emails with:",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          attrs: {
            color: "",
          },
          content: [
            {
              type: "paragraph",
              attrs: {
                textAlign: "left",
                class: null,
              },
              content: [
                {
                  type: "text",
                  text: "A bullet list with one …",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          attrs: {
            color: "",
          },
          content: [
            {
              type: "paragraph",
              attrs: {
                textAlign: "left",
                class: null,
              },
              content: [
                {
                  type: "text",
                  text: "… or two list items.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "You can also insert user variables: Hi ",
        },
        {
          type: "userProperty",
          attrs: {
            variableName: "name",
            defaultValue: "there",
            defaultOpen: false,
          },
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "If you require more more complex templating logic, you can write raw MJML and liquid syntax with a Markup Block.",
        },
      ],
    },
    {
      type: "markupBlock",
      attrs: {
        language: null,
        class: "markup-block markup-extension",
      },
      content: [
        {
          type: "text",
          text: '{% assign items = "Item 1,Item 2,Item 3,Item 4" | split: "," %}\n\n<mj-column>\n  {% for item in items limit:2 %}\n    <mj-text>\n      {{ item }}\n    </mj-text>\n  {% endfor %}\n</mj-column>\n<mj-column>\n  {% for item in items offset:2 %}\n    <mj-text>\n      {{ item }}\n    </mj-text>\n  {% endfor %}\n</mj-column>',
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "Or with inline markup, ",
        },
        {
          type: "text",
          marks: [
            {
              type: "markupInline",
              attrs: {
                class: null,
              },
            },
          ],
          text: '{{ user.email | default: "example@email.com" }}',
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "You can also highlight text to ",
        },
        {
          type: "text",
          marks: [
            {
              type: "italic",
            },
          ],
          text: "format",
        },
        {
          type: "text",
          text: " ",
        },
        {
          type: "text",
          marks: [
            {
              type: "bold",
            },
          ],
          text: "it",
        },
        {
          type: "text",
          text: " ",
        },
        {
          type: "text",
          marks: [
            {
              type: "underline",
            },
          ],
          text: "in",
        },
        {
          type: "text",
          text: " ",
        },
        {
          type: "text",
          marks: [
            {
              type: "textStyle",
              attrs: {
                color: null,
                fontFamily: "Courier",
                fontSize: null,
              },
            },
          ],
          text: "various",
        },
        {
          type: "text",
          text: " ",
        },
        {
          type: "text",
          marks: [
            {
              type: "textStyle",
              attrs: {
                color: "#f50404",
                fontFamily: null,
                fontSize: null,
              },
            },
          ],
          text: "ways",
        },
        {
          type: "text",
          text: ". ",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
      content: [
        {
          type: "text",
          text: "Finally, don’t forget a footer with your company address and an unsubscribe link!",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "center",
        class: null,
      },
      content: [
        {
          type: "text",
          marks: [
            {
              type: "textStyle",
              attrs: {
                color: "#999999",
                fontFamily: null,
                fontSize: null,
              },
            },
          ],
          text: "Company Inc, 3 Abbey Road, San Francisco CA 94102",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "center",
        class: null,
      },
      content: [
        {
          type: "text",
          marks: [
            {
              type: "textStyle",
              attrs: {
                color: "#999999",
                fontFamily: null,
                fontSize: null,
              },
            },
          ],
          text: "Don’t like these emails? ",
        },
        {
          type: "unsubscribeLink",
          attrs: {
            linkText: "unsubscribe",
          },
          marks: [
            {
              type: "textStyle",
              attrs: {
                color: "#999999",
                fontFamily: null,
                fontSize: null,
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        class: null,
      },
    },
  ],
};
