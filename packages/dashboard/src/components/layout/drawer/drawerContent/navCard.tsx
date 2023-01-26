// material-ui
import { Stack, Typography } from "@mui/material";

// project import
import MainCard from "../../../mainCard";

// ==============================|| DRAWER CONTENT - NAVIGATION CARD ||============================== //

function NavCard() {
  return <MainCard sx={{ bgcolor: "grey.50", m: 3 }}>
    <Stack alignItems="center" spacing={2.5}>
      {/* <CardMedia component="img" image={avatar} sx={{ width: 112 }} /> */}
      <Stack alignItems="center">
        <Typography variant="h5">Dittofeed</Typography>
        <Typography variant="h6" color="secondary">
          Customer Engagement
        </Typography>
      </Stack>
    </Stack>
  </MainCard>
}

export default NavCard;
