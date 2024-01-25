// project import
import Badge from "./Badge";
import Button from "./Button";
import CardContent from "./CardContent";
import Checkbox from "./Checkbox";
import Chip from "./Chip";
import IconButton from "./IconButton";
import LinearProgress from "./LinearProgress";
import Link from "./Link";
import ListItemIcon from "./ListItemIcon";
import Tab from "./Tab";
import TableCell from "./TableCell";
import Tabs from "./Tabs";
import Typography from "./Typography";

// ==============================|| OVERRIDES - MAIN ||============================== //

export default function ComponentsOverrides(theme) {
  return Object.assign(
    Button(theme),
    Badge(theme),
    CardContent(),
    Checkbox(theme),
    Chip(theme),
    IconButton(theme),
    LinearProgress(),
    Link(),
    ListItemIcon(),
    Tab(theme),
    TableCell(theme),
    Tabs(),
    Typography(),
  );
}
