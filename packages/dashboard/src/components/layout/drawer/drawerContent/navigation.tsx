// material-ui
import { ArrowBackIos } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useContext } from "react";

import { useAppStorePick } from "../../../../lib/appStore";
import { LayoutContext } from "../../context";
import MinimalNavGroup from "./navigation/minimalNavGroup";
import NavGroup from "./navigation/navGroup";

// ==============================|| DRAWER CONTENT - NAVIGATION ||============================== //

function Navigation() {
  const { features } = useAppStorePick(["features"]);
  const layout = useContext(LayoutContext);
  const items = layout?.items;
  const title = layout?.pageTitle;
  const backLink = layout?.backLink;
  const navigationRenderer = layout?.navigationRenderer;
  const isMinimal = navigationRenderer === "minimal";

  const navGroups = items
    ? items.flatMap((item) => {
        if (features.WhiteLabel && item.id === "support") {
          return [];
        }
        switch (item.type) {
          case "group":
            return isMinimal ? (
              <MinimalNavGroup key={item.id} item={item} />
            ) : (
              <NavGroup key={item.id} item={item} />
            );
          default:
            return (
              <Typography
                key={item.id}
                variant="h6"
                color="error"
                align="center"
              >
                Fix - Navigation Group
              </Typography>
            );
        }
      })
    : null;

  return (
    <Box sx={{ pt: 2, px: isMinimal ? 3 : undefined }}>
      {title ? (
        <Stack direction="row" sx={{ ml: -1, alignItems: "center" }}>
          {backLink ? (
            <IconButton component={Link} href={backLink}>
              <ArrowBackIos fontSize="inherit" />
            </IconButton>
          ) : null}
          <Typography variant="h1" fontSize={21}>
            {title}
          </Typography>
        </Stack>
      ) : null}
      {navGroups}
    </Box>
  );
}

export default Navigation;
