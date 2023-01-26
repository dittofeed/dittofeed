import { createContext } from "react";

import { MenuItemGroup } from "../menuItems/types";

export interface LayoutContextValues {
  items: MenuItemGroup[];
}
export const LayoutContext = createContext<LayoutContextValues | null>(null);
