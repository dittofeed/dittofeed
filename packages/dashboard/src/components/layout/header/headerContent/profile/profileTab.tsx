// assets
import { Settings } from "@mui/icons-material";
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
// material-ui
import { useTheme } from "@mui/material/styles";
import { useRouter } from "next/router";

// ==============================|| HEADER PROFILE - PROFILE TAB ||============================== //

function ProfileTab() {
  const theme = useTheme();
  const path = useRouter();

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
      <ListItemButton onClick={() => path.push("/settings")}>
        <ListItemIcon>
          <Settings />
        </ListItemIcon>
        <ListItemText primary="Settings" />
      </ListItemButton>
    </List>
  );
}

export default ProfileTab;
