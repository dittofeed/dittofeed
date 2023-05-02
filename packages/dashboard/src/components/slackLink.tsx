import ExternalLink from "./externalLink";

export default function SlackLink({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <ExternalLink
      href="https://join.slack.com/t/dittofeed-community/shared_invite/zt-1u3lyts83-P6npff1AbjniNRLVlrlM5A"
      enableLinkStyling
    >
      {children}
    </ExternalLink>
  );
}
