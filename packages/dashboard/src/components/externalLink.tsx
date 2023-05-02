export default function ExternalLink({
  children,
  enableLinkStyling,
  ...linkProps
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
  children: React.ReactNode;
  enableLinkStyling?: boolean;
  href: string;
}) {
  const style = enableLinkStyling
    ? undefined
    : {
        textDecoration: "none",
        color: "inherit",
      };
  return (
    <a target="_blank" rel="noopener noreferrer" style={style} {...linkProps}>
      {children}
    </a>
  );
}
