import { List, ListItem, ListItemProps, ListProps } from "@mui/material";
import React from "react";

export function BulletList({ sx, ...props }: ListProps) {
  return <List sx={{ listStyleType: "disc", ...sx }} {...props} />;
}

export function BulletListItem({ sx, ...props }: ListItemProps) {
  return <ListItem sx={{ display: "list-item", ...sx }} {...props} />;
}
