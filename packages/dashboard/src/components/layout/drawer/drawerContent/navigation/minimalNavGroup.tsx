// material-ui
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Collapse, List, ListItemButton, ListItemText } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

import { useAppStore } from "../../../../../lib/appStore";
import { MenuItemGroup } from "../../../../menuItems/types";
import MinimalNavItem from "./minimalNavItem";
// project import

// ==============================|| NAVIGATION - LIST GROUP ||============================== //

function MinimalNavGroup({ item }: { item: MenuItemGroup }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = item.children.length > 0;
  const drawerOpen = useAppStore((state) => state.drawerOpen);

  const navCollapse = item.children.map((menuItem) => (
    <MinimalNavItem key={menuItem.id} item={menuItem} level={1} />
  ));
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  const Arrow = isExpanded ? ExpandLess : ExpandMore;

  return hasChildren ? (
    <List sx={{ mb: drawerOpen ? 1 : 0, py: 0, zIndex: 0 }}>
      <ListItemButton
        onClick={toggleExpand}
        sx={{ paddingX: 1, paddingY: 0.5, borderRadius: 2 }}
      >
        <ListItemText primary={item.title} />
        <Arrow sx={{ fontSize: 16 }} />
      </ListItemButton>
      <Collapse in={isExpanded}>
        <List component="li" disablePadding>
          {navCollapse}
        </List>
      </Collapse>
    </List>
  ) : (
    <ListItemButton
      href={item.url ?? ""}
      component={item.external ? "a" : Link}
      sx={{
        paddingX: 1,
        paddingY: 0.5,
        borderRadius: 2,
        mb: drawerOpen ? 1 : 0,
        zIndex: 0,
      }}
    >
      <ListItemText primary={item.title} />
    </ListItemButton>
  );
}

export default MinimalNavGroup;
