export interface MenuItemGroup {
  id: string;
  title: string;
  type: "group";
  children: MenuItem[];
  url?: string;
  external?: string;
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
