import { Stack, useTheme, Typography, Box, TextField } from "@mui/material";
import { useRouter } from "next/router";
import Image from 'next/image';
import EditableName from "../editableName";
import InfoTooltip from "../infoTooltip";
import ReactCodeMirror from "@uiw/react-codemirror";
import { useAppStore } from "../../lib/appStore";
import { useState } from "react";
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import MobilePreviewImage from "../../../public/mobile-mock.svg";

const USER_PROPERTIES_TOOLTIP =
  "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";


export default function MobilePushEditor() {
  const theme = useTheme();
  const router = useRouter();
  const [templateTitle, setTemplateTitle] = useState<string>('Default Message Title');
  const userPropertiesJSON = useAppStore(
    (state) => state.mobilePushMessageUserPropertiesJSON
  );
  const setUserPropertiesJSON = useAppStore(
    (state) => state.setMobilePushMessagePropsJSON
  );

  const title = useAppStore((state) => state.mobilePushMessageTitle);
  const message = useAppStore((state) => state.mobilePushMessageMessage);
  const imageUrl = useAppStore((state) => state.mobilePushMesssageImageUrl);

  const setTitle = useAppStore((state) => state.setMobilePushMessageTitle);
  const setMessage = useAppStore((state) => state.setMobilePushMessageMessage);
  const setImageUrl = useAppStore((state) => state.setMobilePushMessageImageUrl);

  const jsonCodeMirrorHandleChange = (val: string) => {
    setUserPropertiesJSON(val);
    try {
      const parsed = JSON.parse(val);
      if (!(typeof parsed === "object" && parsed !== null)) {
        return;
      }
      const parsedObj: Record<string, unknown> = parsed;
      const props: Record<string, string> = {};

      // eslint-disable-next-line guard-for-in
      for (const key in parsedObj) {
        const parsedVal = parsed[key];
        if (typeof parsedVal !== "string") {
          continue;
        }
        props[key] = parsedVal;
      }
      // eslint-disable-next-line no-empty
    } catch (e) { }
  };

  const editor = (
    <Stack>
      <TextField
        label="Title"
        variant="filled"
        InputProps={{
          sx: {
            borderTopRightRadius: 0,
          },
        }}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextField
        label="Message"
        variant="filled"
        InputProps={{
          sx: {
            borderTopRightRadius: 0,
          },
        }}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <TextField
        label="Image URL"
        variant="filled"
        InputProps={{
          sx: {
            borderTopRightRadius: 0,
          },
        }}
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
    </Stack>
  );

  const preview = (
    <Stack sx={{
      position: 'relative'
    }}>
      <Image style={{ position: 'absolute', marginLeft: 'auto', marginRight: 'auto', left: 0, right: 0 }} src={MobilePreviewImage} alt='mobile preview' />
      <Box sx={{
        position: 'absolute',
        marginLeft: 'auto', marginRight: 'auto', left: 0, right: 0,
        width: '90%',
        top: 300,
      }}>
        <Box sx={{
          width: '100%',
          padding: '20px 10px',
          backgroundColor: '#fff', borderRadius: '16px',
          marginX: 'auto', left: 0, right: 0,
          position: 'relative'
        }}>

          <Box>
            <Typography
              variant="h5"
            >
              {title}
            </Typography>
            <Typography
              variant="body1"
            >
              {message}
            </Typography>
            {imageUrl && <Box sx={{
              position: 'relative',
              maxHeight: '160px', height: '160px',
              marginTop: '16px',
              borderRadius: '16px'
            }}>
              <Image
                src={imageUrl} alt='push icon' fill style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '16px'
                }} />
            </Box>}
          </Box>

        </Box>
      </Box>
    </Stack>
  );

  return <Stack
    direction="row"
    sx={{
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
      <EditableName
        name={templateTitle}
        variant="h4"
        onChange={(e) => {
          setTemplateTitle(e.target.value);
        }}
      />
      <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
        <Typography variant="h5">User Properties</Typography>
      </InfoTooltip>
      <ReactCodeMirror
        value={userPropertiesJSON}
        onChange={jsonCodeMirrorHandleChange}
        extensions={[
          codeMirrorJson(),
          linter(jsonParseLinter()),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              fontFamily: theme.typography.fontFamily,
            },
          }),
          lintGutter(),
        ]}
      />
    </Stack>
    <Stack direction="row" sx={{ flex: 1 }}>
      <Box
        sx={{
          width: "100%",
        }}
      >
        {editor}
      </Box>
    </Stack>
    <Stack direction="row" sx={{ flex: 1 }}>
      <Box
        sx={{
          width: "100%",
        }}
      >
        {preview}
      </Box>
    </Stack>
  </Stack>
}

export const defaultInitialUserProperties = {
  email: "test@email.com",
  id: "ad44fb62-91a4-4ec7-be24-7f9364e331b1",
  phone: "2025550161",
  language: "en-US",
  anonymousId: "0b0d3a71-0a86-4e60-892a-d27f0b290c81",
};