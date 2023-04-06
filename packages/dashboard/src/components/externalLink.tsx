export default function ExternalLink({
  children,
  ...linkProps
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      style={{
        textDecoration: "none",
        color: "inherit",
      }}
      {...linkProps}
    >
      {children}
    </a>
  );
}
