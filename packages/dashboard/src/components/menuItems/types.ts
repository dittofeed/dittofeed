import React from "react";

export interface MenuItemGroup {
  id: string;
  title: string;
  type: "group";
  children: MenuItem[];
}
export interface MenuItem {
  id: string;
  title: string;
  type: "item";
  url: string;
  icon: React.FC;
  external?: boolean;
  breadcrumbs?: boolean;
  description: string;
  disabled?: true;
}
