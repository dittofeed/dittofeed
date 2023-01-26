import { Grid, Typography } from "@mui/material";
// material-ui
import MuiBreadcrumbs from "@mui/material/Breadcrumbs";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

// project imports
import MainCard from "./mainCard";
import navigation from "./menuItems/main";
import { MenuItem, MenuItemGroup } from "./menuItems/types";

// ==============================|| BREADCRUMBS ||============================== //

// TODO cleanup
function Breadcrumbs({
  breadcrumbTitle,
  ...others
}: React.ComponentProps<typeof MainCard> & {
  breadcrumbTitle?: boolean;
}) {
  const router = useRouter();
  let { pathname } = router;

  // const [main, setMain] = useState<MenuItemGroup | null>(null);
  const [item, setItem] = useState<MenuItem | null>(null);

  // set active item state
  const setMainAndItem = (menu: MenuItemGroup) => {
    menu.children.forEach((childItem) => {
      if (pathname === childItem.url) {
        setItem(childItem);
      }
    });
  };

  useEffect(() => {
    navigation.items.forEach((menu) => {
      setMainAndItem(menu);
    });
  });

  // only used for component demo breadcrumbs
  if (pathname === "/breadcrumbs") {
    pathname = "/dashboard/analytics";
  }

  let mainContent;
  let itemContent;
  let breadcrumbContent = <Typography />;

  // items
  if (item) {
    itemContent = (
      <Typography variant="subtitle1" color="textPrimary">
        {item.title}
      </Typography>
    );

    // main
    if (item.breadcrumbs !== false) {
      breadcrumbContent = (
        <MainCard
          border={false}
          sx={{ mb: 3, bgcolor: "transparent" }}
          content={false}
          {...others}
        >
          <Grid
            container
            direction="column"
            justifyContent="flex-start"
            alignItems="flex-start"
            spacing={1}
          >
            <Grid item>
              <MuiBreadcrumbs aria-label="breadcrumb">
                <Typography
                  component={Link}
                  href="/dashboard"
                  color="textSecondary"
                  variant="h6"
                  sx={{ textDecoration: "none" }}
                >
                  Home
                </Typography>
                {mainContent}
                {itemContent}
              </MuiBreadcrumbs>
            </Grid>
            {breadcrumbTitle && (
              <Grid item sx={{ mt: 2 }}>
                <Typography variant="h5">{item.title}</Typography>
              </Grid>
            )}
          </Grid>
        </MainCard>
      );
    }
  }

  return breadcrumbContent;
}

export default Breadcrumbs;
