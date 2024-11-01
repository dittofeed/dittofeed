import React from "react";

export default function ExternalLink({
  children,
  disableNewTab = false,
  enableLinkStyling,
  ...linkProps
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
  children: React.ReactNode;
  enableLinkStyling?: boolean;
  disableNewTab?: boolean;
  href: string;
}) {
  const style = enableLinkStyling
    ? undefined
    : {
        textDecoration: "none",
        color: "inherit",
      };
  const newTabProps = disableNewTab
    ? {}
    : { target: "_blank", rel: "noopener noreferrer" };
  return (
    <a {...newTabProps} style={style} {...linkProps}>
      {children}
    </a>
  );
}
