import ExternalLink from "./externalLink";

export default function DiscordLink({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <ExternalLink href="https://discord.gg/HajPkCG4Mm" enableLinkStyling>
      {children}
    </ExternalLink>
  );
}
