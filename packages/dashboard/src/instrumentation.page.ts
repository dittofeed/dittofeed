export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initOpenTelemetry } = await import("backend-lib/src/openTelemetry");

    // TODO add request context to span
    await initOpenTelemetry({
      serviceName: "dittofeed-dashboard",
      configOverrides: {
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingPaths: ["/dashboard/api"],
        },
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      },
    });
  }
}
