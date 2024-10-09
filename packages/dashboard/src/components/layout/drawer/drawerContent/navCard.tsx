import { Stack, Typography } from "@mui/material";

import { useAppStorePick } from "../../../../lib/appStore";
import MainCard from "../../../mainCard";

// ==============================|| DRAWER CONTENT - NAVIGATION CARD ||============================== //

function NavCard() {
  const { features } = useAppStorePick(["features"]);
  if (features.WhiteLabel) {
    return null;
  }
  // FIXME
  return (
    <MainCard sx={{ bgcolor: "grey.50", m: 3 }}>
      <Stack alignItems="center" spacing={2.5} p={2}>
        <Stack alignItems="center">
          <Typography variant="h5">Dittofeed</Typography>
          <Typography variant="h6" color="secondary">
            Customer Engagement
          </Typography>
        </Stack>
      </Stack>
    </MainCard>
  );
}

export default NavCard;
