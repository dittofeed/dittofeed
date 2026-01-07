import { CommandPaletteProvider } from "./commandPalette";
import DashboardHead from "./dashboardHead";
import MainLayout from "./mainLayout";

export default function DashboardContent({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      <DashboardHead />
      <MainLayout>
        <>{children}</>
      </MainLayout>
    </CommandPaletteProvider>
  );
}
