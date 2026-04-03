// assets
import {
  Logout,
  Person,
  Settings,
  SettingsApplications,
} from "@mui/icons-material";
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
// material-ui
import { useTheme } from "@mui/material/styles";
import Link from "next/link";

import { useAppStorePick } from "../../../../../lib/appStore";

// ==============================|| HEADER PROFILE - PROFILE TAB ||============================== //

function ProfileTab() {
  const theme = useTheme();
  const {
    signoutUrl,
    enableAdditionalDashboardSettings,
    additionalDashboardSettingsPath,
    additionalDashboardSettingsTitle,
    authMode,
  } = useAppStorePick([
    "signoutUrl",
    "enableAdditionalDashboardSettings",
    "additionalDashboardSettingsPath",
    "additionalDashboardSettingsTitle",
    "authMode",
  ]);

  return (
    <List
      component="nav"
      sx={{
        p: 0,
        "& .MuiListItemIcon-root": {
          minWidth: 32,
          color: theme.palette.grey[500],
        },
      }}
    >
      {authMode === "multi-tenant" ? (
        <ListItemButton LinkComponent={Link} href="/profile">
          <ListItemIcon>
            <Person />
          </ListItemIcon>
          <ListItemText primary="My Profile" />
        </ListItemButton>
      ) : null}
      <ListItemButton LinkComponent={Link} href="/settings">
        <ListItemIcon>
          <Settings />
        </ListItemIcon>
        <ListItemText primary="Settings" />
      </ListItemButton>
      {enableAdditionalDashboardSettings && additionalDashboardSettingsPath ? (
        <ListItemButton href={additionalDashboardSettingsPath}>
          <ListItemIcon>
            <SettingsApplications />
          </ListItemIcon>
          <ListItemText
            primary={additionalDashboardSettingsTitle ?? "Additional Settings"}
          />
        </ListItemButton>
      ) : null}
      {signoutUrl ? (
        <ListItemButton LinkComponent={Link} href={signoutUrl}>
          <ListItemIcon>
            <Logout />
          </ListItemIcon>
          <ListItemText primary="Sign Out" />
        </ListItemButton>
      ) : null}
    </List>
  );
}

export default ProfileTab;
