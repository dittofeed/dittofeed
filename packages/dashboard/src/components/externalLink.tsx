export default function ExternalLink({
  children,
  ...linkProps
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  children: React.ReactNode;
}) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      style={{
        textDecoration: "none",
      }}
      {...linkProps}
    >
      {children}
    </a>
  );
}
