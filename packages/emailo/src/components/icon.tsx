import React from "react";

export function Icon({
  name,
  className,
}: {
  name: string;
  // eslint-disable-next-line react/require-default-props
  className?: string;
}) {
  return <div>{name}</div>;
}
