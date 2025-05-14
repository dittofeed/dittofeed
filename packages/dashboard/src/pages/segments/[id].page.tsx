import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";

import DashboardContent from "../../components/dashboardContent";
import { SegmentEditorV2 } from "../../components/segments/editorV2";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";

export const getServerSideProps = getSegmentServerSideProps;

export default function NewSegment() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;
  const theme = useTheme();
  if (!id) {
    return null;
  }
  return (
    <DashboardContent>
      <SegmentEditorV2 id={id} sx={{ padding: theme.spacing(3) }} />
    </DashboardContent>
  );
}
