import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Button, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { parseReturnNavigation } from "../../lib/returnNavigation";
import { useNavigationGuard } from "../../lib/useNavigationGuard";

export interface ReturnLinkProps {
  /** Fallback label if none in URL */
  fallbackLabel?: string;
  /** Fallback path if none in URL */
  fallbackPath?: string;
}

export default function ReturnLink({
  fallbackLabel = "Back",
  fallbackPath,
}: ReturnLinkProps) {
  const router = useRouter();
  const { isNavigating, navigateSafely } = useNavigationGuard();

  const returnInfo = useMemo(() => {
    return parseReturnNavigation(router.query);
  }, [router.query]);

  // If no return info and no fallback, don't render
  if (!returnInfo && !fallbackPath) {
    return null;
  }

  const label = returnInfo?.returnLabel ?? fallbackLabel;
  const path = returnInfo?.returnPath ?? fallbackPath;

  const handleClick = () => {
    if (path) {
      navigateSafely(path);
    }
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
          {label}
        </Typography>
      </Stack>
    </Button>
  );
}
