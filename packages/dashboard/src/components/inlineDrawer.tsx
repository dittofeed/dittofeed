/**
 * A drawer that is inline with the content of the page. Uses the mui slider
 * component to slide in the drawer. Does not reuse the mui drawer component in
 * order to avoid a backdrop. The drawer header is visible at all times, and the
 * drawer header and children are both visible when the drawer is open. It
 * slides up from the bottom of the page.
 */
export function InlineDrawer({
  open,
  header,
  children,
}: {
  open: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return <></>;
}
