// project import
import NavCard from "./drawerContent/navCard";
import Navigation from "./drawerContent/navigation";
import SimpleBar from "./drawerContent/simpleBar";

// ==============================|| DRAWER CONTENT ||============================== //

function DrawerContent() {
  return (
    <SimpleBar
      sx={{
        "& .simplebar-content": {
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <>
        <Navigation />
        <NavCard />
      </>
    </SimpleBar>
  );
}

export default DrawerContent;
