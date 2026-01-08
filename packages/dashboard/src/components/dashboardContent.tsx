import dynamic from "next/dynamic";

import DashboardHead from "./dashboardHead";
import MainLayout from "./mainLayout";

const CommandPalette = dynamic(() => import("./commandPalette"), {
  ssr: false,
});

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
      <CommandPalette />
    </>
  );
}
