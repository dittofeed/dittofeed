import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Button, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { parseReturnNavigation } from "../../lib/returnNavigation";
import { useNavigationGuard } from "../../lib/useNavigationGuard";

export default function ReturnLink() {
  const router = useRouter();
  const { isNavigating, navigateSafely } = useNavigationGuard();

  const returnInfo = useMemo(() => {
    return parseReturnNavigation(router.query);
  }, [router.query]);

  // Only render when there are actual return params in the URL
  if (!returnInfo) {
    return null;
  }

  const handleClick = () => {
    navigateSafely(returnInfo.returnPath);
  };

  return (
    <Button
      startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
      onClick={handleClick}
      disabled={isNavigating}
      size="small"
      sx={{
        ml: 2,
        flexShrink: 0,
        textTransform: "none",
        bgcolor: "grey.100",
        color: "text.secondary",
        "&:hover": {
          bgcolor: "grey.200",
        },
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        whiteSpace: "nowrap",
      }}
    >
      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
        Back to {returnInfo.returnLabel}
      </Typography>
    </Button>
  );
}
