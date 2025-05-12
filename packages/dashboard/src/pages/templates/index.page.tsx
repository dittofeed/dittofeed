import { GetServerSideProps } from "next";

import DashboardContent from "../../components/dashboardContent";
import TemplatesTable from "../../components/messages/templatesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
      }),
    };
  });

export default function TemplateList() {
  return (
    <DashboardContent>
      <TemplatesTable />
    </DashboardContent>
  );
}
