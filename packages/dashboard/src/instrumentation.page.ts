export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initOpenTelemetry } = await import("backend-lib/src/openTelemetry");

    // TODO add request context to span
    // TODO ensure we use the lite service name when running in lite mode
    const { start } = await initOpenTelemetry({
      serviceName: "dittofeed-dashboard",
      configOverrides: {
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingPaths: ["/api"],
        },
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      },
    });
    await start();
  }
}
