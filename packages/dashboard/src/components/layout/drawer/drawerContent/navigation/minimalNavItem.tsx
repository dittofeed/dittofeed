import { SvgIconComponent } from "@mui/icons-material";
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
// material-ui
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { useAppStore } from "../../../../../lib/appStore";
// project import
import { MenuItem } from "../../../../menuItems/types";

// ==============================|| NAVIGATION - LIST ITEM ||============================== //

function MinimalNavItem({ item, level }: { level: number; item: MenuItem }) {
  const Icon = item.icon as SvgIconComponent;
  const path = useRouter();
  const isSelected = item.url === path.asPath;
  const drawerOpen = useAppStore((state) => state.drawerOpen);
  const description = item.disabled
    ? `Coming Soon: ${item.description}`
    : item.description;

  return (
    <Tooltip title={description} placement="right" arrow>
      <span>
        <ListItemButton
          href={item.url}
          disabled={item.disabled}
          target={item.external ? "_blank" : "_self"}
          component={item.external ? "a" : Link}
          selected={isSelected}
          sx={{
            borderRadius: 2,
            paddingX: 1,
            paddingY: 0.5,
            ml: level * 1.5,
          }}
        >
          <ListItemIcon>
            <Icon sx={{ fontSize: "1rem" }} />
          </ListItemIcon>
          {(drawerOpen || level !== 1) && (
            <ListItemText
              primary={<Typography variant="h6">{item.title}</Typography>}
            />
          )}
        </ListItemButton>
      </span>
    </Tooltip>
  );
}

export default MinimalNavItem;
