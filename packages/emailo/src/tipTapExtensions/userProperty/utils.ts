export interface UserProperty {
  name: string;
}

export interface UserPropertyOptions {
  properties: UserProperty[];
}

export interface UserPropertyAttributes {
  variableName: string;
  defaultValue: string;
  defaultOpen: boolean;
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
