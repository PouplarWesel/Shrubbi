import Mapbox from "@rnmapbox/maps";

const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

if (!accessToken) {
  // Keep the app booting, but make it obvious why maps don't render.
  console.warn(
    "Missing Mapbox token: set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your env.",
  );
} else {
  Mapbox.setAccessToken(accessToken);
}

// Mapbox requires providing users a way to disable telemetry. For hack/demo builds we
// disable it by default; adjust if you add an in-app setting.
Mapbox.setTelemetryEnabled(false);

export { Mapbox };
