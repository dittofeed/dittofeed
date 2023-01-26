import { useRouter } from "next/router";

import JourneysBuilder from "../../../../components/journeys/journeysBuilder";
import JourneyLayout from "../../../../components/journeys/layout";

export { getServerSideProps } from "./getServerSideProps";

function Journey() {
  const path = useRouter();
  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  return (
    <JourneyLayout journeyId={id}>
      <JourneysBuilder />
    </JourneyLayout>
  );
}
export default Journey;
