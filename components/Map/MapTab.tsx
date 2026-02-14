import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  BottomSheetModal,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import {
  Camera,
  FillExtrusionLayer,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
  StyleURL,
  SymbolLayer,
} from "@rnmapbox/maps";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type MetricKey = "co2" | "plants" | "members";

type CityMapStatsRow = {
  city_id: string | null;
  city_name: string | null;
  city_state: string | null;
  country_code: string | null;
  center_lat: number | null;
  center_lon: number | null;
  bbox_sw_lat: number | null;
  bbox_sw_lon: number | null;
  bbox_ne_lat: number | null;
  bbox_ne_lon: number | null;
  boundary_geojson?: unknown;
  member_count: number | null;
  total_plants: number | null;
  total_co2_removed_kg: number | null;
  best_plant_type: string | null;
  best_plant_type_count: number | null;
  type_breakdown: unknown;
};

const DEFAULT_CENTER: [number, number] = [-119.4179, 36.7783]; // California-ish
const FALLBACK_BOX_DEG = 0.12;

const metricLabel: Record<MetricKey, string> = {
  co2: "CO2",
  plants: "Plants",
  members: "People",
};

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
};

const formatKg = (value: number) => `${formatCompactNumber(value)} kg`;

const safeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const sortBreakdown = (breakdown: Record<string, unknown>) => {
  return Object.entries(breakdown)
    .map(([key, val]) => ({ key, value: safeNumber(val) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
};

type GeoJSONPolygonGeometry =
  | { type: "Polygon"; coordinates: unknown }
  | { type: "MultiPolygon"; coordinates: unknown };

const pickBoundaryGeometry = (
  value: unknown,
): GeoJSONPolygonGeometry | null => {
  if (!value || typeof value !== "object") return null;
  const maybeFeature = value as { type?: unknown; geometry?: unknown };
  const geometry =
    maybeFeature.type === "Feature" && maybeFeature.geometry
      ? maybeFeature.geometry
      : value;

  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: unknown; coordinates?: unknown };
  if (g.type !== "Polygon" && g.type !== "MultiPolygon") return null;
  if (!Array.isArray(g.coordinates)) return null;

  return g as GeoJSONPolygonGeometry;
};

const buildStops = (max: number, colors: string[]) => {
  const clampedMax = Math.max(max, 1);
  const stops: (number | string)[] = [];
  const ratios = [0, 0.12, 0.28, 0.5, 0.72, 1];

  for (let i = 0; i < ratios.length; i += 1) {
    const ratio = ratios[i];
    const color = colors[Math.min(colors.length - 1, i)];
    stops.push(ratio * clampedMax, color);
  }

  return stops;
};

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { supabase } = useSupabase();

  const cameraRef = useRef<Camera>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  const [metric, setMetric] = useState<MetricKey>("co2");
  const [is3d, setIs3d] = useState(true);

  const [rows, setRows] = useState<CityMapStatsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("city_map_stats")
        .select(
          [
            "city_id",
            "city_name",
            "city_state",
            "country_code",
            "center_lat",
            "center_lon",
            "bbox_sw_lat",
            "bbox_sw_lon",
            "bbox_ne_lat",
            "bbox_ne_lon",
            "boundary_geojson",
            "member_count",
            "total_plants",
            "total_co2_removed_kg",
            "best_plant_type",
            "best_plant_type_count",
            "type_breakdown",
          ].join(","),
        );

      if (isCancelled) return;

      if (error) {
        const isMissingView =
          typeof (error as { code?: unknown }).code === "string" &&
          (error as { code?: string }).code === "PGRST205";

        setRows([]);
        setErrorMessage(
          isMissingView
            ? "Missing DB view: city_map_stats. Apply the Supabase SQL migration for city_map_stats, then restart the app."
            : "Could not load city map stats.",
        );
        setIsLoading(false);
        if (isMissingView) {
          console.warn(
            "city_map_stats view missing in PostgREST schema cache",
            error,
          );
        } else {
          console.error("city_map_stats load failed", error);
        }
        return;
      }

      setRows((data ?? []) as CityMapStatsRow[]);
      setIsLoading(false);
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [supabase]);

  const selectedCity = useMemo(() => {
    if (!selectedCityId) return null;
    return rows.find((row) => row.city_id === selectedCityId) ?? null;
  }, [rows, selectedCityId]);

  const featureCollection = useMemo(() => {
    const features = rows
      .filter((row) => {
        const hasBoundary = Boolean(pickBoundaryGeometry(row.boundary_geojson));
        const hasCenter = row.center_lat != null && row.center_lon != null;
        const hasBox =
          row.bbox_sw_lat != null &&
          row.bbox_sw_lon != null &&
          row.bbox_ne_lat != null &&
          row.bbox_ne_lon != null;

        return Boolean(
          row.city_id && row.city_name && (hasBoundary || hasCenter || hasBox),
        );
      })
      .map((row) => {
        const centerLon =
          row.center_lon ??
          (row.bbox_sw_lon != null && row.bbox_ne_lon != null
            ? (row.bbox_sw_lon + row.bbox_ne_lon) / 2
            : DEFAULT_CENTER[0]);
        const centerLat =
          row.center_lat ??
          (row.bbox_sw_lat != null && row.bbox_ne_lat != null
            ? (row.bbox_sw_lat + row.bbox_ne_lat) / 2
            : DEFAULT_CENTER[1]);

        const swLon = row.bbox_sw_lon ?? centerLon - FALLBACK_BOX_DEG;
        const swLat = row.bbox_sw_lat ?? centerLat - FALLBACK_BOX_DEG;
        const neLon = row.bbox_ne_lon ?? centerLon + FALLBACK_BOX_DEG;
        const neLat = row.bbox_ne_lat ?? centerLat + FALLBACK_BOX_DEG;

        const score =
          metric === "co2"
            ? safeNumber(row.total_co2_removed_kg)
            : metric === "plants"
              ? safeNumber(row.total_plants)
              : safeNumber(row.member_count);

        const boundaryGeometry = pickBoundaryGeometry(row.boundary_geojson);

        return {
          type: "Feature" as const,
          id: row.city_id,
          properties: {
            city_id: row.city_id,
            city_name: row.city_name,
            city_state: row.city_state,
            country_code: row.country_code,
            member_count: safeNumber(row.member_count),
            total_plants: safeNumber(row.total_plants),
            total_co2_removed_kg: safeNumber(row.total_co2_removed_kg),
            best_plant_type: row.best_plant_type,
            best_plant_type_count: safeNumber(row.best_plant_type_count),
            score,
          },
          geometry: boundaryGeometry ?? {
            type: "Polygon" as const,
            coordinates: [
              [
                [swLon, swLat],
                [neLon, swLat],
                [neLon, neLat],
                [swLon, neLat],
                [swLon, swLat],
              ],
            ],
          },
        };
      });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [metric, rows]);

  const maxScore = useMemo(() => {
    let max = 0;
    for (const feature of featureCollection.features) {
      const next = safeNumber(feature.properties.score);
      if (next > max) max = next;
    }
    return Math.max(max, 1);
  }, [featureCollection.features]);

  const fillColors = useMemo(() => {
    // Deep green -> mint glow, tuned for dark styles.
    return [
      "#001a18",
      "#0b3b36",
      "#0f5c53",
      "#168c7d",
      "#39cbb5",
      COLORS.primary,
    ];
  }, []);

  const fillColorExpression = useMemo(() => {
    return [
      "interpolate",
      ["linear"],
      ["get", "score"],
      ...buildStops(maxScore, fillColors),
    ];
  }, [fillColors, maxScore]);

  const extrusionHeightExpression = useMemo(() => {
    // In meters. Keeps the tallest city readable without turning into a skyscraper city.
    const maxHeight = 6000;
    return [
      "interpolate",
      ["linear"],
      ["get", "score"],
      0,
      0,
      maxScore,
      maxHeight,
    ];
  }, [maxScore]);

  const handleSelectCity = (cityId: string) => {
    setSelectedCityId(cityId);
    sheetRef.current?.present();

    const row = rows.find((r) => r.city_id === cityId);
    if (!row) return;

    const centerLon =
      row.center_lon ??
      (row.bbox_sw_lon != null && row.bbox_ne_lon != null
        ? (row.bbox_sw_lon + row.bbox_ne_lon) / 2
        : DEFAULT_CENTER[0]);
    const centerLat =
      row.center_lat ??
      (row.bbox_sw_lat != null && row.bbox_ne_lat != null
        ? (row.bbox_sw_lat + row.bbox_ne_lat) / 2
        : DEFAULT_CENTER[1]);

    cameraRef.current?.setCamera({
      centerCoordinate: [centerLon, centerLat],
      zoomLevel: 9,
      pitch: is3d ? 50 : 0,
      heading: 0,
      animationDuration: 900,
    });
  };

  const handleSourcePress = (event: {
    features?: { id?: string | number; properties?: any }[];
  }) => {
    const hit = event.features?.[0];
    const cityId =
      typeof hit?.properties?.city_id === "string"
        ? hit.properties.city_id
        : typeof hit?.id === "string"
          ? hit.id
          : null;

    if (!cityId) return;
    handleSelectCity(cityId);
  };

  const toggle3d = () => {
    setIs3d((prev) => {
      const next = !prev;
      cameraRef.current?.setCamera({
        pitch: next ? 50 : 0,
        animationDuration: 500,
      });
      return next;
    });
  };

  const statsBreakdown = useMemo(() => {
    if (!selectedCity) return [];
    const breakdown = selectedCity.type_breakdown;
    if (!breakdown || typeof breakdown !== "object") return [];
    return sortBreakdown(breakdown as Record<string, unknown>);
  }, [selectedCity]);

  const breakdownMax = useMemo(() => {
    if (!statsBreakdown.length) return 1;
    return Math.max(1, statsBreakdown[0]?.value ?? 1);
  }, [statsBreakdown]);

  return (
    <BottomSheetModalProvider>
      <View style={styles.container}>
        <MapView
          style={styles.map}
          styleURL={StyleURL.Dark}
          pitchEnabled
          rotateEnabled
          attributionEnabled
        >
          <Camera
            ref={cameraRef}
            centerCoordinate={DEFAULT_CENTER}
            zoomLevel={5.3}
            pitch={is3d ? 50 : 0}
            animationMode="flyTo"
            animationDuration={0}
          />

          {/* Base 3D buildings from the style's composite source (nice backdrop for the city overlays). */}
          <FillExtrusionLayer
            id="shrubbi-3d-buildings"
            existing={false}
            sourceID="composite"
            sourceLayerID="building"
            filter={["==", "extrude", "true"]}
            minZoomLevel={14}
            style={{
              fillExtrusionColor: "#2a2f33",
              fillExtrusionOpacity: 0.45,
              fillExtrusionHeight: ["get", "height"],
              fillExtrusionBase: ["get", "min_height"],
            }}
          />

          <ShapeSource
            id="shrubbi-city-stats"
            shape={featureCollection}
            onPress={handleSourcePress}
            hitbox={{ width: 12, height: 12 }}
          >
            <FillLayer
              id="shrubbi-city-fill"
              existing={false}
              style={{
                fillColor: fillColorExpression,
                fillOpacity: 0.55,
                fillAntialias: true,
              }}
            />

            {is3d ? (
              <FillExtrusionLayer
                id="shrubbi-city-extrusion"
                existing={false}
                minZoomLevel={6}
                style={{
                  fillExtrusionColor: fillColorExpression,
                  fillExtrusionHeight: extrusionHeightExpression,
                  fillExtrusionOpacity: 0.72,
                }}
              />
            ) : null}

            <LineLayer
              id="shrubbi-city-outline"
              existing={false}
              style={{
                lineColor: COLORS.primary + "B3",
                lineWidth: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  0.6,
                  9,
                  1.4,
                ],
                lineOpacity: 0.9,
              }}
            />

            <LineLayer
              id="shrubbi-city-outline-selected"
              existing={false}
              filter={[
                "==",
                ["get", "city_id"],
                selectedCityId ? selectedCityId : "",
              ]}
              style={{
                lineColor: COLORS.primary,
                lineWidth: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  1.2,
                  9,
                  2.6,
                ],
                lineOpacity: 1,
              }}
            />

            <SymbolLayer
              id="shrubbi-city-label"
              existing={false}
              minZoomLevel={7}
              style={{
                textField: ["get", "city_name"],
                textSize: 12,
                textAllowOverlap: false,
                textColor: COLORS.secondary,
                textHaloColor: COLORS.background,
                textHaloWidth: 1,
                textHaloBlur: 0.6,
              }}
            />
          </ShapeSource>
        </MapView>

        <View style={[styles.overlay, { paddingTop: insets.top + 10 }]}>
          <View style={styles.panel}>
            {Platform.OS === "ios" ? (
              <BlurView
                tint="dark"
                intensity={86}
                style={StyleSheet.absoluteFill}
              />
            ) : null}

            <View style={styles.panelHeader}>
              <View style={styles.panelTitleWrap}>
                <Text style={styles.panelTitle}>City Pulse</Text>
                <Text style={styles.panelSubTitle}>
                  Tap a city for stats and top plant types.
                </Text>
              </View>

              <Pressable onPress={toggle3d} style={styles.iconButton}>
                <Ionicons
                  name={is3d ? "cube" : "cube-outline"}
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.iconButtonText}>{is3d ? "3D" : "2D"}</Text>
              </Pressable>
            </View>

            <View style={styles.segment}>
              {(Object.keys(metricLabel) as MetricKey[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setMetric(key)}
                  style={[
                    styles.segmentItem,
                    metric === key && styles.segmentItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentItemText,
                      metric === key && styles.segmentItemTextActive,
                    ]}
                  >
                    {metricLabel[key]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading city stats...</Text>
              </View>
            ) : errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : (
              <View style={styles.legendRow}>
                <Text style={styles.legendLabel}>Low</Text>
                <View style={styles.legendBar}>
                  {fillColors.map((color) => (
                    <View
                      key={color}
                      style={[styles.legendStop, { backgroundColor: color }]}
                    />
                  ))}
                </View>
                <Text style={styles.legendLabel}>High</Text>
              </View>
            )}
          </View>
        </View>

        <BottomSheetModal
          ref={sheetRef}
          snapPoints={["26%", "56%"]}
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={styles.sheetContent}>
            {selectedCity ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>
                    {selectedCity.city_name}
                  </Text>
                  <Text style={styles.sheetSubtitle}>
                    {selectedCity.city_state
                      ? `${selectedCity.city_state} - `
                      : ""}
                    {selectedCity.country_code ?? "US"}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Plants</Text>
                    <Text style={styles.statValue}>
                      {formatCompactNumber(
                        safeNumber(selectedCity.total_plants),
                      )}
                    </Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>People</Text>
                    <Text style={styles.statValue}>
                      {formatCompactNumber(
                        safeNumber(selectedCity.member_count),
                      )}
                    </Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>CO2 Removed</Text>
                    <Text style={styles.statValue}>
                      {formatKg(safeNumber(selectedCity.total_co2_removed_kg))}
                    </Text>
                  </View>
                </View>

                <View style={styles.bestRow}>
                  <Ionicons name="leaf" size={16} color={COLORS.secondary} />
                  <Text style={styles.bestText}>
                    Best plant type:{" "}
                    <Text style={styles.bestStrong}>
                      {selectedCity.best_plant_type ?? "N/A"}
                    </Text>
                    {selectedCity.best_plant_type_count != null
                      ? ` (${formatCompactNumber(
                          safeNumber(selectedCity.best_plant_type_count),
                        )})`
                      : ""}
                  </Text>
                </View>

                {statsBreakdown.length ? (
                  <View style={styles.breakdownWrap}>
                    <Text style={styles.breakdownTitle}>Plant Type Mix</Text>
                    {statsBreakdown.slice(0, 6).map((item) => (
                      <View key={item.key} style={styles.breakdownRow}>
                        <Text style={styles.breakdownKey}>{item.key}</Text>
                        <View style={styles.breakdownBarTrack}>
                          <View
                            style={[
                              styles.breakdownBarFill,
                              {
                                width: `${Math.round(
                                  (item.value / breakdownMax) * 100,
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.breakdownVal}>
                          {formatCompactNumber(item.value)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.breakdownEmpty}>
                    No plant type data yet for this city.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.breakdownEmpty}>
                Tap a city to see stats.
              </Text>
            )}
          </View>
        </BottomSheetModal>
      </View>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
  },
  panel: {
    borderRadius: 18,
    overflow: "hidden",
    padding: 14,
    backgroundColor:
      Platform.OS === "ios" ? "transparent" : COLORS.background + "E6",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitleWrap: {
    flex: 1,
  },
  panelTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  panelSubTitle: {
    color: COLORS.secondary,
    opacity: 0.85,
    marginTop: 2,
    fontSize: 12,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.primary + "10",
  },
  iconButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  segment: {
    flexDirection: "row",
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.secondary + "26",
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  segmentItemActive: {
    backgroundColor: COLORS.primary + "14",
  },
  segmentItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.secondary,
    opacity: 0.85,
  },
  segmentItemTextActive: {
    color: COLORS.primary,
    opacity: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  loadingText: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  errorText: {
    color: COLORS.warning,
    marginTop: 12,
    fontSize: 12,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  legendLabel: {
    color: COLORS.secondary,
    fontSize: 11,
    opacity: 0.8,
    width: 28,
  },
  legendBar: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.secondary + "1F",
  },
  legendStop: {
    flex: 1,
  },
  sheetBackground: {
    backgroundColor: COLORS.background + "F2",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "1A",
  },
  sheetHandle: {
    backgroundColor: COLORS.secondary + "55",
    width: 40,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHeader: {
    marginBottom: 10,
  },
  sheetTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "800",
  },
  sheetSubtitle: {
    color: COLORS.secondary,
    opacity: 0.9,
    marginTop: 4,
    fontSize: 12,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary + "22",
    backgroundColor: COLORS.primary + "08",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statLabel: {
    color: COLORS.secondary,
    opacity: 0.85,
    fontSize: 11,
    fontWeight: "700",
  },
  statValue: {
    color: COLORS.primary,
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary + "1A",
    backgroundColor: COLORS.background + "80",
  },
  bestText: {
    color: COLORS.secondary,
    fontSize: 12,
    flex: 1,
  },
  bestStrong: {
    color: COLORS.primary,
    fontWeight: "900",
  },
  breakdownWrap: {
    marginTop: 14,
  },
  breakdownTitle: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  breakdownKey: {
    color: COLORS.secondary,
    width: 80,
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.9,
  },
  breakdownBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: COLORS.secondary + "1A",
    borderWidth: 1,
    borderColor: COLORS.secondary + "14",
  },
  breakdownBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary + "C9",
  },
  breakdownVal: {
    width: 54,
    textAlign: "right",
    color: COLORS.secondary,
    fontSize: 12,
    opacity: 0.9,
    fontWeight: "800",
  },
  breakdownEmpty: {
    color: COLORS.secondary,
    opacity: 0.85,
    marginTop: 16,
    fontSize: 12,
  },
});
