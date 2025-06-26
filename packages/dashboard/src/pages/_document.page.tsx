import createEmotionServer from "@emotion/server/create-instance";
import backendConfig from "backend-lib/src/config";
import { AppType } from "next/app";
import Document, {
  DocumentContext,
  DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";

import { DittofeedAppProps } from "../components/app";
import createEmotionCache from "../lib/createEmotionCache";

export interface DittofeedDocumentProps extends DocumentInitialProps {
  emotionStyleTags: React.ReactNode[];
  appVersion?: string;
}

export default function DittofeedDocument({
  emotionStyleTags,
  appVersion,
}: DittofeedDocumentProps) {
  return (
    <Html>
      <Head>
        {/* Code seems right. Might be a result of using page extensions nextjs option. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap"
        />
        <meta name="emotion-insertion-point" content="" />
        {/* disable indexing the dashboard */}
        <meta name="robots" content="noindex, nofollow" />
        {/* Hidden app version meta tag */}
        {appVersion && (
          <meta name="dittofeed-app-version" content={appVersion} />
        )}
        {emotionStyleTags}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

// `getInitialProps` belongs to `_document` (instead of `_app`),
// it's compatible with static-site generation (SSG).
DittofeedDocument.getInitialProps = async (
  ctx: DocumentContext,
): Promise<DittofeedDocumentProps> => {
  // Resolution order
  //
  // On the server:
  // 1. app.getInitialProps
  // 2. page.getInitialProps
  // 3. document.getInitialProps
  // 4. app.render
  // 5. page.render
  // 6. document.render
  //
  // On the server with error:
  // 1. document.getInitialProps
  // 2. app.render
  // 3. page.render
  // 4. document.render
  //
  // On the client
  // 1. app.getInitialProps
  // 2. page.getInitialProps
  // 3. app.render
  // 4. page.render

  const originalRenderPage = ctx.renderPage;

  // You can consider sharing the same Emotion cache between all the SSR requests to speed up performance.
  // However, be aware that it can have global side effects.
  const cache = createEmotionCache();
  const { extractCriticalToChunks } = createEmotionServer(cache);

  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (
        DittofeedApp: AppType | React.ComponentType<DittofeedAppProps>,
      ) =>
        function EnhanceApp(props) {
          return <DittofeedApp emotionCache={cache} {...props} />;
        },
    });

  const initialProps = await Document.getInitialProps(ctx);
  // This is important. It prevents Emotion to render invalid HTML.
  // See https://github.com/mui/material-ui/issues/26561#issuecomment-855286153
  const emotionStyles = extractCriticalToChunks(initialProps.html);
  const emotionStyleTags = emotionStyles.styles.map((style) => (
    <style
      data-emotion={`${style.key} ${style.ids.join(" ")}`}
      key={style.key}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: style.css }}
    />
  ));

  let appVersion: string | undefined;
  try {
    // Get app version from backend config
    const { appVersion: configAppVersion } = backendConfig();
    appVersion = configAppVersion;
  } catch (error) {
    // If config is not available (e.g., in some build contexts), just continue without it
    console.warn("Unable to get app version from config:", error);
  }

  return {
    ...initialProps,
    emotionStyleTags,
    appVersion,
  };
};
