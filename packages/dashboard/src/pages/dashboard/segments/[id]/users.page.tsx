import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";

import { useAppStore } from "../../../../lib/appStore";
import getSegmentServerSideProps from "./getSegmentServerSideProps";
import SegmentLayout from "./segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

export default function SegmentUsers() {
  const editedSegment = useAppStore((state) => state.editedSegment);
  const theme = useTheme();

  if (!editedSegment) {
    return null;
  }
  const { name } = editedSegment;
  return (
    <SegmentLayout segmentId={editedSegment.id} tab="users">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Typography variant="h4">Users in {name}</Typography>
      </Stack>
    </SegmentLayout>
  );
}
