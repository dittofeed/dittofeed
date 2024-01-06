import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import {
  Box,
  Dialog,
  Divider,
  FormLabel,
  IconButton,
  Slide,
  Stack,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import React from "react";
import { useImmer } from "use-immer";

function TransitionInner(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
}

const Transition = React.forwardRef(TransitionInner);

interface State {
  fullscreen: "preview" | "editor" | null;
}

export default function TemplateEditor() {
  const theme = useTheme();
  const [{ fullscreen }, setState] = useImmer<State>({
    fullscreen: null,
  });
  const handleFullscreenClose = () => {
    setState((draft) => {
      draft.fullscreen = null;
    });
  };
  return (
    <>
      <Stack
        direction="row"
        sx={{
          height: "100%",
          width: "100%",
          paddingRight: 2,
          paddingTop: 2,
        }}
        spacing={1}
      >
        <Stack
          direction="column"
          spacing={2}
          sx={{
            borderTopRightRadius: 1,
            width: "25%",
            padding: 1,
            border: `1px solid ${theme.palette.grey[200]}`,
            boxShadow: theme.shadows[2],
          }}
        >
          User Properties
        </Stack>
        <Stack direction="row" sx={{ flex: 1 }}>
          {/* FIXME consolidate box */}
          <Box
            sx={{
              width: "50%",
            }}
          >
            <Stack
              sx={{
                width: "100%",
                height: "100%",
              }}
              spacing={1}
            >
              Editor
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <FormLabel sx={{ paddingLeft: 1 }}>Body Message</FormLabel>
                {fullscreen === null ? (
                  <IconButton
                    size="small"
                    onClick={() =>
                      setState((draft) => {
                        draft.fullscreen = "editor";
                      })
                    }
                  >
                    <Fullscreen />
                  </IconButton>
                ) : (
                  <IconButton size="small" onClick={handleFullscreenClose}>
                    <FullscreenExit />
                  </IconButton>
                )}
              </Stack>
            </Stack>
          </Box>
          <Divider orientation="vertical" />
          <Box
            sx={{
              width: "50%",
            }}
          >
            <Stack
              sx={{
                width: "100%",
                height: "100%",
              }}
              spacing={1}
            >
              Preview
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <FormLabel sx={{ paddingLeft: 1 }}>Body Preview</FormLabel>
                {fullscreen === null ? (
                  <IconButton
                    size="small"
                    onClick={() =>
                      setState((draft) => {
                        draft.fullscreen = "preview";
                      })
                    }
                  >
                    <Fullscreen />
                  </IconButton>
                ) : (
                  <IconButton size="small" onClick={handleFullscreenClose}>
                    <FullscreenExit />
                  </IconButton>
                )}
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Stack>
      <Dialog
        fullScreen
        open={fullscreen === "editor"}
        onClose={handleFullscreenClose}
        TransitionComponent={Transition}
      >
        Editor
      </Dialog>
      <Dialog
        fullScreen
        open={fullscreen === "preview"}
        onClose={handleFullscreenClose}
        TransitionComponent={Transition}
      >
        Preview
      </Dialog>
    </>
  );
}
