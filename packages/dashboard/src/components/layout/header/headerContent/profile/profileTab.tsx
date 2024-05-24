// assets
import { Logout, Settings } from "@mui/icons-material";
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
// material-ui
import { useTheme } from "@mui/material/styles";
import Link from "next/link";

import { useAppStore } from "../../../../../lib/appStore";

// ==============================|| HEADER PROFILE - PROFILE TAB ||============================== //

function ProfileTab() {
  const theme = useTheme();
  const signoutUrl = useAppStore((store) => store.signoutUrl);

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
      <ListItemButton LinkComponent={Link} href="/settings">
        <ListItemIcon>
          <Settings />
        </ListItemIcon>
        <ListItemText primary="Settings" />
      </ListItemButton>
      {signoutUrl ? (
        <ListItemButton href={signoutUrl}>
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
