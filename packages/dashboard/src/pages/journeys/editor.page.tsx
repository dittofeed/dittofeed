import { Box } from "@mui/material";
import { useRouter } from "next/router";

import JourneysBuilder from "../../components/journeys/journeysBuilder";
import JourneyLayout from "../../components/journeys/layout";
import {
  JourneyGetServerSideProps,
  journeyGetServerSideProps,
} from "./getServerSideProps";

export const getServerSideProps: JourneyGetServerSideProps = (ctx) =>
  journeyGetServerSideProps(ctx);

function Journey() {
  const path = useRouter();
  const id = typeof path.query.jId === "string" ? path.query.jId : undefined;
  if (!id) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
      <JourneyLayout journeyId={id}>
        <JourneysBuilder journeyId={id} />
      </JourneyLayout>
    </Box>
  );
}
export default Journey;
