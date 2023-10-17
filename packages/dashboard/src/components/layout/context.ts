import { LinkProps } from "next/link";
import { createContext, PropsWithChildren } from "react";

import { MenuItemGroup } from "../menuItems/types";

export interface LayoutContextValues {
  pageTitle?: string;
  backLink?: string;
  items: MenuItemGroup[];
  navigationRenderer?: "default" | "minimal";
}
export const LayoutContext = createContext<LayoutContextValues | null>(null);
