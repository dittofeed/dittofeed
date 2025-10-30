import { Static, Type } from "@sinclair/typebox";

// Low Code Email Editor V2 Types

export const LowCodeEmailBodyNodeTypeV2 = {
  Paragraph: "Paragraph",
  Button: "Button",
  Row: "Row",
} as const;

export const LowCodeEmailBodyNodeTypeEnumV2 = Type.KeyOf(
  Type.Const(LowCodeEmailBodyNodeTypeV2),
);

export type LowCodeEmailBodyNodeTypeV2 = Static<
  typeof LowCodeEmailBodyNodeTypeEnumV2
>;

export const TextAlign = {
  Left: "Left",
  Center: "Center",
  Right: "Right",
} as const;

export const TextAlignEnum = Type.KeyOf(Type.Const(TextAlign));

export type TextAlign = Static<typeof TextAlignEnum>;

export const LowCodeEmailParagraphNodeV2 = Type.Object({
  type: Type.Literal(LowCodeEmailBodyNodeTypeV2.Paragraph),
  id: Type.String(),
  content: Type.String(),
  styles: Type.Optional(
    Type.Object({
      fontSize: Type.Optional(Type.String()),
      color: Type.Optional(Type.String()),
      textAlign: Type.Optional(TextAlignEnum),
      fontFamily: Type.Optional(Type.String()),
      lineHeight: Type.Optional(Type.String()),
      padding: Type.Optional(Type.String()),
    }),
  ),
});

export type LowCodeEmailParagraphNodeV2 = Static<
  typeof LowCodeEmailParagraphNodeV2
>;

export const LowCodeEmailButtonNodeV2 = Type.Object({
  type: Type.Literal(LowCodeEmailBodyNodeTypeV2.Button),
  id: Type.String(),
  text: Type.String(),
  href: Type.String(),
  styles: Type.Optional(
    Type.Object({
      backgroundColor: Type.Optional(Type.String()),
      color: Type.Optional(Type.String()),
      fontSize: Type.Optional(Type.String()),
      fontFamily: Type.Optional(Type.String()),
      borderRadius: Type.Optional(Type.String()),
      padding: Type.Optional(Type.String()),
      textAlign: Type.Optional(TextAlignEnum),
    }),
  ),
});

export type LowCodeEmailButtonNodeV2 = Static<typeof LowCodeEmailButtonNodeV2>;

// Base node type for row children (only Paragraph and Button nodes can be inside rows)
export const LowCodeEmailRowChildNodeV2 = Type.Union([
  LowCodeEmailParagraphNodeV2,
  LowCodeEmailButtonNodeV2,
]);

export type LowCodeEmailRowChildNodeV2 = Static<
  typeof LowCodeEmailRowChildNodeV2
>;

// Generic column type with percentage width
export const LowCodeEmailColumnV2 = Type.Object({
  widthPercent: Type.Number(),
  children: Type.Array(LowCodeEmailRowChildNodeV2),
});

export type LowCodeEmailColumnV2 = Static<typeof LowCodeEmailColumnV2>;

export const LowCodeEmailRowNodeV2 = Type.Object({
  type: Type.Literal(LowCodeEmailBodyNodeTypeV2.Row),
  id: Type.String(),
  columns: Type.Array(LowCodeEmailColumnV2),
  styles: Type.Optional(
    Type.Object({
      backgroundColor: Type.Optional(Type.String()),
      padding: Type.Optional(Type.String()),
    }),
  ),
});

export type LowCodeEmailRowNodeV2 = Static<typeof LowCodeEmailRowNodeV2>;

// Top-level body node type
export const LowCodeEmailBodyNodeV2 = Type.Union([
  LowCodeEmailParagraphNodeV2,
  LowCodeEmailButtonNodeV2,
  LowCodeEmailRowNodeV2,
]);

export type LowCodeEmailBodyNodeV2 = Static<typeof LowCodeEmailBodyNodeV2>;
