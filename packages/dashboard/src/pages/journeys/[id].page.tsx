import { useRouter } from "next/router";
import React from "react";

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
  const id = typeof path.query.id === "string" ? path.query.id : undefined;
  if (!id) {
    return null;
  }

  return (
    <JourneyLayout journeyId={id}>
      <JourneysBuilder journeyId={id} />
    </JourneyLayout>
  );
}
export default Journey;
