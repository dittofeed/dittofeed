import {
  CacheProvider as EmotionCacheProvider,
  EmotionCache,
} from "@emotion/react";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { enableMapSet } from "immer";
import type { AppProps } from "next/app";
import Head from "next/head";
import { SnackbarProvider } from "notistack";

import { Provider as StoreProvider, useCreateStore } from "../lib/appStore";
import createEmotionCache from "../lib/createEmotionCache";
import { PreloadedState } from "../lib/types";
import ThemeCustomization from "../themeCustomization";
import { ThemeModeProvider } from "../themeCustomization/ThemeContext";

// Client-side cache, shared for the whole session of the user in the browser.
const clientSideEmotionCache = createEmotionCache();

export interface DittofeedAppProps
  extends AppProps<{ serverInitialState?: PreloadedState }> {
  emotionCache?: EmotionCache;
}

enableMapSet();

const queryClient = new QueryClient();

declare module "@mui/material/styles" {
  interface Theme {
    customShadows: {
      button: string;
      text: string;
      z1: string;
      inset: string;
    };
    typography: {
      htmlFontSize: string;
      fontFamily: string;
      fontWeightLight: string;
      fontWeightRegular: string;
      fontWeightMedium: string;
      fontWeightBold: string;
      h1: {
        fontWeight: string;
        fontSize: string;
        lineHeight: number;
      };
      h2: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      h3: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      h4: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      h5: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      h6: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      caption: {
        fontWeight: number;
        fontSize: string;
        lineHeight: number;
      };
      body1: {
        fontSize: string;
        lineHeight: number;
      };
      body2: {
        fontSize: string;
        lineHeight: number;
      };
      subtitle1: {
        fontSize: string;
        fontWeight: number;
        lineHeight: number;
      };
      subtitle2: {
        fontSize: string;
        fontWeight: number;
        lineHeight: number;
      };
      overline: {
        lineHeight: number;
      };
      button: {
        textTransform: string;
      };
    };
    palette: {
      mode: "dark" | "light";
      common: {
        black: string;
        white: string;
      };
      primary: {
        lighter: string;
        100: string;
        200: string;
        light: string;
        400: string;
        main: string;
        dark: string;
        700: string;
        darker: string;
        900: string;
        contrastText: string;
      };
      secondary: {
        lighter: string;
        100: string;
        200: string;
        light: string;
        400: string;
        main: string;
        600: string;
        dark: string;
        800: string;
        darker: string;
        A100: string;
        A200: string;
        A300: string;
        contrastText: string;
      };
      error: {
        lighter: string;
        light: string;
        main: string;
        dark: string;
        darker: string;
        contrastText: string;
      };
      warning: {
        lighter: string;
        light: string;
        main: string;
        dark: string;
        darker: string;
        contrastText: string;
        postIt: string;
        postItContrastText: string;
      };
      info: {
        lighter: string;
        light: string;
        main: string;
        dark: string;
        darker: string;
        contrastText: string;
      };
      success: {
        lighter: string;
        light: string;
        main: string;
        dark: string;
        darker: string;
        contrastText: string;
      };
      grey: {
        0: string;
        50: string;
        100: string;
        200: string;
        300: string;
        400: string;
        500: string;
        600: string;
        700: string;
        800: string;
        900: string;
        A50: string;
        A100: string;
        A200: string;
        A400: string;
        A700: string;
        A800: string;
      };
      blue: {
        default: string;
        100: string;
        200: string;
        300: string;
      };
      text: {
        primary: string;
        secondary: string;
        disabled: string;
      };
      action: {
        disabled: string;
      };
      divider: string;
      background: {
        paper: string;
        default: string;
      };
    };
  }
}

export default function App({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}: DittofeedAppProps) {
  const createStore = useCreateStore(pageProps.serverInitialState);

  return (
    <StoreProvider createStore={createStore}>
      <EmotionCacheProvider value={emotionCache}>
        <Head>
          <meta name="viewport" content="initial-scale=1, width=device-width" />
        </Head>
        <ThemeModeProvider>
        <ThemeCustomization>
          <SnackbarProvider preventDuplicate>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <QueryClientProvider client={queryClient}>
                <Component {...pageProps} />
              </QueryClientProvider>
            </LocalizationProvider>
          </SnackbarProvider>
        </ThemeCustomization>
        </ThemeModeProvider>
      </EmotionCacheProvider>
    </StoreProvider>
  );
}
