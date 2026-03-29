import { Stack } from "@mui/material";
import { useRouter } from "next/router";

import DashboardContent from "../../components/dashboardContent";
import { SegmentEditorV2 } from "../../components/segments/editorV2";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";

export const getServerSideProps = getSegmentServerSideProps;

export default function NewSegment() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;
  if (!id) {
    return null;
  }
  return (
    <DashboardContent>
      <Stack
        sx={{
          flex: 1,
          minHeight: 0,
          alignSelf: "stretch",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          px: 2,
          pt: 2,
          pb: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SegmentEditorV2 id={id} />
      </Stack>
    </DashboardContent>
  );
}
