import React from "react";

import Layout from "./layout";
import menuItems from "./menuItems/main";

export default function MainLayout(
  props: Omit<React.ComponentProps<typeof Layout>, "items">,
) {
  return <Layout items={menuItems.items} {...props} />;
}
