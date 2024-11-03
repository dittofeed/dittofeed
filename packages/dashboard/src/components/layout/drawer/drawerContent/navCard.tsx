import { Stack, Typography } from "@mui/material";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { WhiteLabelFeatureConfig } from "isomorphic-lib/src/types";
import { useMemo } from "react";

import { useAppStorePick } from "../../../../lib/appStore";
import MainCard from "../../../mainCard";

// ==============================|| DRAWER CONTENT - NAVIGATION CARD ||============================== //

function NavCard() {
  const { features } = useAppStorePick(["features"]);
  const whiteLabelConfig = useMemo(() => {
    if (!features.WhiteLabel) {
      return null;
    }
    const result = schemaValidateWithErr(
      features.WhiteLabel,
      WhiteLabelFeatureConfig,
    );
    if (result.isErr()) {
      return null;
    }
    return result.value;
  }, [features.WhiteLabel]);

  if (whiteLabelConfig && !whiteLabelConfig.navCardTitle) {
    return null;
  }
  const title = whiteLabelConfig?.navCardTitle || "Dittofeed";
  const description = whiteLabelConfig
    ? whiteLabelConfig.navCardDescription ?? null
    : "Customer Engagement";

  const icon = whiteLabelConfig?.navCardIcon ? (
    <img
      style={{
        height: "2rem",
      }}
      src={whiteLabelConfig.navCardIcon}
      alt="Nav Card Icon"
    />
  ) : null;

  return (
    <MainCard sx={{ bgcolor: "grey.50", m: 3 }}>
      <Stack alignItems="center" spacing={2.5} p={2} width="100%">
        {icon}
        <Typography
          variant="h5"
          sx={{
            overflowWrap: "break-word",
            wordBreak: "break-word",
            hyphens: "auto",
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="h6"
          color="secondary"
          sx={{
            overflowWrap: "break-word",
            wordBreak: "break-word",
            hyphens: "auto",
            width: "100%",
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {description}
        </Typography>
      </Stack>
    </MainCard>
  );
}

export default NavCard;
