import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
// material-ui
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { useRouter } from "next/router";

import { useAppStore } from "../../../../../lib/appStore";
// project import
import { MenuItem } from "../../../../menuItems/types";

// ==============================|| NAVIGATION - LIST ITEM ||============================== //

function NavItem({ item, level }: { level: number; item: MenuItem }) {
  const theme = useTheme();
  const Icon = item.icon;
  const path = useRouter();
  const isSelected = item.url === path.asPath;
  const drawerOpen = useAppStore((state) => state.drawerOpen);
  const textColor = "text.primary";
  const iconSelectedColor = "primary.main";
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
            zIndex: 1201,
            pl: drawerOpen ? `${level * 28}px` : 1.5,
            py: !drawerOpen && level === 1 ? 1.25 : 1,
            ...(drawerOpen && {
              "&:hover": {
                bgcolor: "primary.lighter",
              },
              "&.Mui-selected": {
                bgcolor: "primary.lighter",
                borderRight: `2px solid ${theme.palette.primary.main}`,
                color: iconSelectedColor,
                "&:hover": {
                  color: iconSelectedColor,
                  bgcolor: "primary.lighter",
                },
              },
            }),
            ...(!drawerOpen && {
              "&:hover": {
                bgcolor: "transparent",
              },
              "&.Mui-selected": {
                "&:hover": {
                  bgcolor: "transparent",
                },
                bgcolor: "transparent",
              },
            }),
          }}
        >
          <ListItemIcon
            sx={{
              fontSize: drawerOpen ? "1rem" : "1.25rem",
              minWidth: 28,
              color: isSelected ? iconSelectedColor : textColor,
              ...(!drawerOpen && {
                borderRadius: 1.5,
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                "&:hover": {
                  bgcolor: "secondary.lighter",
                },
              }),
              ...(!drawerOpen &&
                isSelected && {
                  bgcolor: "primary.lighter",
                  "&:hover": {
                    bgcolor: "primary.lighter",
                  },
                }),
            }}
          >
            <Icon />
          </ListItemIcon>

          {(drawerOpen || level !== 1) && (
            <ListItemText
              primary={
                <Typography
                  variant="h6"
                  sx={{ color: isSelected ? iconSelectedColor : textColor }}
                >
                  {item.title}
                </Typography>
              }
            />
          )}
        </ListItemButton>
      </span>
    </Tooltip>
  );
}

export default NavItem;
