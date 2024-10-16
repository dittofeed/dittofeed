export interface UnsubscribeLinkAttributes {
  linkText: string;
}

export function userPropertyToExpression({
  variableName,
  defaultValue,
}: {
  variableName: string;
  defaultValue: string;
}) {
  const baseExpression = variableName.includes(" ")
    ? `user['${variableName.replace(/'/g, "\\'")}']`
    : `user.${variableName}`;
  const expression =
    defaultValue.length > 0
      ? `${baseExpression} | default: '${defaultValue}'`
      : baseExpression;

  return `{{ ${expression} }}`;
}
