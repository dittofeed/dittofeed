import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Button, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { parseReturnNavigation } from "../../lib/returnNavigation";
import { useNavigationGuard } from "../../lib/useNavigationGuard";

export interface ReturnLinkProps {}

export default function ReturnLink(_props: ReturnLinkProps) {
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
      startIcon={<ArrowBackIcon />}
      onClick={handleClick}
      disabled={isNavigating}
      size="small"
      sx={{ mb: 1, textTransform: "none" }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="body2">Back to</Typography>
        <Typography variant="body2" fontWeight="medium">
          {returnInfo.returnLabel}
        </Typography>
      </Stack>
    </Button>
  );
}
