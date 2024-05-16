import DashboardHead from "./dashboardHead";
import MainLayout from "./mainLayout";

export default function DashboardContent({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <>
      <DashboardHead />
      <MainLayout>
        <>{children}</>
      </MainLayout>
    </>
  );
}
