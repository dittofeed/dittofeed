import { Tab } from "@mui/material";
import Link from "next/link";

export default function TabLink({
  href,
  label,
  disabled,
  index,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  index: number;
}) {
  if (disabled) {
    return <Tab label={label} tabIndex={index} disabled />;
  }
  return (
    <Link href={href} passHref>
      <Tab label={label} tabIndex={index} />
    </Link>
  );
}
