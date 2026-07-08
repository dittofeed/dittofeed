import { Stack, useTheme } from "@mui/material";
import { useRouter } from "next/router";

import { SegmentEditorV2 } from "../../components/segments/editorV2";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";
import SegmentLayout from "./[id]/segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

export default function SegmentMain() {
  const router = useRouter();
  const theme = useTheme();
  const segmentId =
    typeof router.query.id === "string" ? router.query.id : null;

  if (!segmentId) {
    return null;
  }

  return (
    <SegmentLayout segmentId={segmentId} tab="main">
      <Stack sx={{ padding: theme.spacing(3), height: "100%" }}>
        <SegmentEditorV2 id={segmentId} />
      </Stack>
    </SegmentLayout>
  );
}
