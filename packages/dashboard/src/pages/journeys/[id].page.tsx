import { useRouter } from "next/router";

import JourneysBuilder from "../../components/journeys/journeysBuilder";
import JourneyLayout from "../../components/journeys/layout";
import MainLayout from "../../components/mainLayout";
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
    <MainLayout>
      <JourneyLayout journeyId={id}>
        <JourneysBuilder journeyId={id} />
      </JourneyLayout>
    </MainLayout>
  );
}
export default Journey;
