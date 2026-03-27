import { IconButton, Menu, MenuItem } from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import { useState } from "react";
import { useThemeMode } from "../themeCustomization/ThemeContext";

export default function ThemeToggle() {
  const { mode, updateMode, envTheme } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState(null);

  if (envTheme !== "default") return null;

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
        <Brightness4Icon />
      </IconButton>

      <Menu
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
      >
        <MenuItem onClick={() => updateMode("light")}>Light</MenuItem>
        <MenuItem onClick={() => updateMode("dark")}>Dark</MenuItem>
        <MenuItem onClick={() => updateMode("system")}>System</MenuItem>
      </Menu>
    </>
  );
}
