// project import
import NavCard from "./navCard";
import Navigation from "./navigation";
import SimpleBar from "./simpleBar";

// ==============================|| DRAWER CONTENT ||============================== //

function DrawerContent() {
  return <SimpleBar
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
}

export default DrawerContent;
