import { CircularProgress, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect } from "react";

export function RedirectPage() {
  const router = useRouter();
  useEffect(() => {
    const { returnTo } = router.query;
    if (typeof returnTo !== "string") {
      router.push("/");
      return;
    }
    router.push(returnTo);
  });
  return (
    <Stack alignContent="center" justifyContent="center">
      <CircularProgress />
    </Stack>
  );
}
