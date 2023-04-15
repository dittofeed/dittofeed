import { Tab } from "@mui/material";
import Link from "next/link";

export default function TabLink({
  href,
  label,
  index,
}: {
  href: string;
  label: string;
  index: number;
}) {
  return (
    <Link href={href} passHref>
      <Tab label={label} tabIndex={index} />
    </Link>
  );
}
