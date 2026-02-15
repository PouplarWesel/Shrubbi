import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

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

const BASE_PLACE_LABEL_LAYER_IDS = [
  "place-label",
  "settlement-label",
  "settlement-minor-label",
  "settlement-subdivision-label",
  "settlement-major-label",
  "state-label",
  "state-label-sm",
  "state-label-md",
  "state-label-lg",
  "country-label",
  "country-label-sm",
  "country-label-md",
  "country-label-lg",
] as const;

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

const normalizeCityId = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const cityIdsMatch = (left: unknown, right: unknown) => {
  const leftId = normalizeCityId(left);
  const rightId = normalizeCityId(right);
  if (!leftId || !rightId) return false;
  return leftId.toLowerCase() === rightId.toLowerCase();
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

type CityBounds = {
  ne: [number, number];
  sw: [number, number];
};

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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isCoordinatePair = (value: unknown): value is [number, number] => {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
};

const isLinearRing = (value: unknown): value is [number, number][] => {
  if (!Array.isArray(value) || value.length < 3) return false;
  return value.every((point) => isCoordinatePair(point));
};

const signedRingArea = (ring: [number, number][]) => {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
};

const primaryPolygonCoordinates = (
  geometry: GeoJSONPolygonGeometry,
): unknown => {
  if (geometry.type === "Polygon") return geometry.coordinates;

  let bestPolygon: unknown = null;
  let bestArea = 0;

  for (const polygon of geometry.coordinates as unknown[]) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const outerRing = polygon[0];
    if (!isLinearRing(outerRing)) continue;
    const area = Math.abs(signedRingArea(outerRing));
    if (area > bestArea) {
      bestArea = area;
      bestPolygon = polygon;
    }
  }

  if (bestPolygon) return bestPolygon;
  return (geometry.coordinates as unknown[])[0] ?? geometry.coordinates;
};

const collectCoordinatePairs = (value: unknown, out: [number, number][]) => {
  if (isCoordinatePair(value)) {
    out.push([value[0], value[1]]);
    return;
  }

  if (!Array.isArray(value)) return;
  for (const item of value) {
    collectCoordinatePairs(item, out);
  }
};

const boundsCenterFromCoordinates = (
  coordinates: unknown,
): [number, number] | null => {
  const points: [number, number][] = [];
  collectCoordinatePairs(coordinates, points);
  if (!points.length) return null;

  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
};

const boundsFromCoordinates = (coordinates: unknown): CityBounds | null => {
  const points: [number, number][] = [];
  collectCoordinatePairs(coordinates, points);
  if (!points.length) return null;

  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const lonSpan = Math.max(maxLon - minLon, 0);
  const latSpan = Math.max(maxLat - minLat, 0);
  if (lonSpan < 1e-6 || latSpan < 1e-6) return null;

  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
};

const accumulateRingMoments = (
  ring: [number, number][],
  totals: { cross: number; momentX: number; momentY: number },
) => {
  const count = ring.length;
  if (count < 3) return;

  for (let i = 0; i < count; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % count];
    const cross = x0 * y1 - x1 * y0;
    totals.cross += cross;
    totals.momentX += (x0 + x1) * cross;
    totals.momentY += (y0 + y1) * cross;
  }
};

const centroidFromBoundary = (
  geometry: GeoJSONPolygonGeometry,
): [number, number] | null => {
  const totals = { cross: 0, momentX: 0, momentY: 0 };
  const polygonCoordinates = primaryPolygonCoordinates(geometry);
  if (!Array.isArray(polygonCoordinates)) return null;

  for (const ring of polygonCoordinates) {
    if (!isLinearRing(ring)) continue;
    accumulateRingMoments(ring, totals);
  }

  if (Math.abs(totals.cross) < 1e-12) return null;

  const cx = totals.momentX / (3 * totals.cross);
  const cy = totals.momentY / (3 * totals.cross);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  return [cx, cy];
};

const resolveCityCenter = (row: CityMapStatsRow): [number, number] => {
  const boundaryGeometry = pickBoundaryGeometry(row.boundary_geojson);
  if (boundaryGeometry) {
    const centroid = centroidFromBoundary(boundaryGeometry);
    if (centroid) return centroid;
  }

  if (isFiniteNumber(row.center_lon) && isFiniteNumber(row.center_lat)) {
    return [row.center_lon, row.center_lat];
  }

  if (
    isFiniteNumber(row.bbox_sw_lon) &&
    isFiniteNumber(row.bbox_ne_lon) &&
    isFiniteNumber(row.bbox_sw_lat) &&
    isFiniteNumber(row.bbox_ne_lat)
  ) {
    return [
      (row.bbox_sw_lon + row.bbox_ne_lon) / 2,
      (row.bbox_sw_lat + row.bbox_ne_lat) / 2,
    ];
  }

  if (boundaryGeometry) {
    const center = boundsCenterFromCoordinates(boundaryGeometry.coordinates);
    if (center) return center;
  }

  return DEFAULT_CENTER;
};

const resolveCityBounds = (
  row: CityMapStatsRow,
  fallbackCenter?: [number, number],
): CityBounds => {
  const boundaryGeometry = pickBoundaryGeometry(row.boundary_geojson);
  if (boundaryGeometry) {
    const bounds = boundsFromCoordinates(
      primaryPolygonCoordinates(boundaryGeometry),
    );
    if (bounds) return bounds;
  }

  if (
    isFiniteNumber(row.bbox_sw_lon) &&
    isFiniteNumber(row.bbox_ne_lon) &&
    isFiniteNumber(row.bbox_sw_lat) &&
    isFiniteNumber(row.bbox_ne_lat) &&
    row.bbox_ne_lon > row.bbox_sw_lon &&
    row.bbox_ne_lat > row.bbox_sw_lat
  ) {
    return {
      ne: [row.bbox_ne_lon, row.bbox_ne_lat],
      sw: [row.bbox_sw_lon, row.bbox_sw_lat],
    };
  }

  const [centerLon, centerLat] = fallbackCenter ?? resolveCityCenter(row);
  return {
    ne: [centerLon + FALLBACK_BOX_DEG, centerLat + FALLBACK_BOX_DEG],
    sw: [centerLon - FALLBACK_BOX_DEG, centerLat - FALLBACK_BOX_DEG],
  };
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

const MAPBOX_GL_VERSION = "v2.15.0";
const MAPBOX_GL_JS_URL = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.js`;
const MAPBOX_GL_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.css`;

let mapboxLoadPromise: Promise<any> | null = null;

const loadMapboxGlAsync = () => {
  if (Platform.OS !== "web") {
    return Promise.reject(new Error("Mapbox GL JS only loads on web."));
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(
      new Error("Mapbox GL JS requires a browser environment."),
    );
  }

  const existing = (window as any).mapboxgl;
  if (existing) return Promise.resolve(existing);
  if (mapboxLoadPromise) return mapboxLoadPromise;

  mapboxLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-shrubbi-mapbox-gl="true"]',
    );
    if (existingScript && (window as any).mapboxgl) {
      resolve((window as any).mapboxgl);
      return;
    }

    if (!document.querySelector('link[data-shrubbi-mapbox-gl="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPBOX_GL_CSS_URL;
      link.setAttribute("data-shrubbi-mapbox-gl", "true");
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = MAPBOX_GL_JS_URL;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-shrubbi-mapbox-gl", "true");

    script.onload = () => {
      if ((window as any).mapboxgl) {
        resolve((window as any).mapboxgl);
      } else {
        reject(
          new Error("Mapbox GL JS loaded but global mapboxgl is missing."),
        );
      }
    };

    script.onerror = () => {
      reject(new Error("Failed to load Mapbox GL JS from CDN."));
    };

    document.head.appendChild(script);
  });

  return mapboxLoadPromise;
};

const hideBasePlaceLabels = (map: any) => {
  const shouldHidePlaceLayer = (layer: any) => {
    if (!layer || layer.type !== "symbol") return false;
    const id = typeof layer.id === "string" ? layer.id : "";
    const sourceLayer =
      typeof layer["source-layer"] === "string" ? layer["source-layer"] : "";

    if (
      /(?:^|-)place-label|settlement|state-label|country-label/i.test(id) ||
      sourceLayer === "place_label"
    ) {
      return true;
    }

    return false;
  };

  const styleLayers = map.getStyle?.()?.layers ?? [];
  for (const layer of styleLayers) {
    if (shouldHidePlaceLayer(layer) && map.getLayer(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }

  for (const layerId of BASE_PLACE_LABEL_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  }
};

export default function MapTabWeb() {
  const { supabase } = useSupabase();

  const mapContainerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const selectedCityIdRef = useRef<string | null>(null);

  const [metric, setMetric] = useState<MetricKey>("co2");
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [rows, setRows] = useState<CityMapStatsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    selectedCityIdRef.current = selectedCityId;
  }, [selectedCityId]);

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
        return;
      }

      // Supabase's generated types may report a GenericStringError[] here when the view
      // isn't present in the type schema; we validate at runtime.
      setRows((data ?? []) as unknown as CityMapStatsRow[]);
      setIsLoading(false);
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [supabase]);

  const selectedCity = useMemo(() => {
    if (!selectedCityId) return null;
    return (
      rows.find((row) => cityIdsMatch(row.city_id, selectedCityId)) ?? null
    );
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
        const [centerLon, centerLat] = resolveCityCenter(row);

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
          id: row.city_id as string,
          properties: {
            city_id: row.city_id,
            city_name: row.city_name,
            city_state: row.city_state,
            country_code: row.country_code,
            center_lon: centerLon,
            center_lat: centerLat,
            member_count: safeNumber(row.member_count),
            total_plants: safeNumber(row.total_plants),
            total_co2_removed_kg: safeNumber(row.total_co2_removed_kg),
            best_plant_type: row.best_plant_type,
            best_plant_type_count: safeNumber(row.best_plant_type_count),
            score,
          },
          geometry:
            boundaryGeometry ??
            ({
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
            } as const),
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
      const next = safeNumber((feature as any)?.properties?.score);
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

  const fetchUserLocation = useCallback(
    async (opts: { forceFresh?: boolean } = {}) => {
      const forceFresh = Boolean(opts.forceFresh);

      try {
        const existing = await Location.getForegroundPermissionsAsync();
        let status = existing.status;

        if (status !== "granted") {
          const requested = await Location.requestForegroundPermissionsAsync();
          status = requested.status;
        }

        if (status !== "granted") return null;

        const lastKnown = forceFresh
          ? null
          : await Location.getLastKnownPositionAsync({});
        const position =
          lastKnown ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserLocation(coords);
        return coords;
      } catch {
        try {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            return null;
          }

          const coords = await new Promise<{
            latitude: number;
            longitude: number;
          }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
              },
              (error) => reject(error),
              {
                enableHighAccuracy: false,
                maximumAge: forceFresh ? 0 : 60_000,
                timeout: 8_000,
              },
            );
          });

          setUserLocation(coords);
          return coords;
        } catch {
          return null;
        }
      }
    },
    [],
  );

  const userLocationFeatureCollection = useMemo(() => {
    if (!userLocation) {
      return { type: "FeatureCollection" as const, features: [] };
    }

    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [userLocation.longitude, userLocation.latitude],
          },
          properties: {},
        },
      ],
    };
  }, [userLocation]);

  const handleLocatePress = useCallback(async () => {
    setIsLocating(true);

    try {
      const coords = await fetchUserLocation({ forceFresh: true });
      if (!coords) return;

      const map = mapRef.current;
      map?.easeTo?.({
        center: [coords.longitude, coords.latitude],
        zoom: 12,
        duration: 800,
      });
    } finally {
      setIsLocating(false);
    }
  }, [fetchUserLocation]);

  useEffect(() => {
    let isCancelled = false;

    const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      setErrorMessage(
        "Missing Mapbox token: set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your env.",
      );
      return;
    }

    const init = async () => {
      try {
        const mapboxgl = await loadMapboxGlAsync();
        if (isCancelled) return;

        mapboxgl.accessToken = accessToken;

        const container = mapContainerRef.current;
        if (!container) {
          setErrorMessage("Map container not ready.");
          return;
        }

        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/dark-v11",
          center: DEFAULT_CENTER,
          zoom: 5.3,
          pitch: 0,
          maxPitch: 0,
          minPitch: 0,
          pitchWithRotate: false,
          antialias: true,
        });

        mapRef.current = map;

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("load", () => {
          if (isCancelled) return;
          hideBasePlaceLabels(map);
          setIsMapReady(true);
        });

        map.on("styledata", () => {
          if (isCancelled) return;
          hideBasePlaceLabels(map);
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load Mapbox GL JS.",
        );
      }
    };

    void init();

    return () => {
      isCancelled = true;
      try {
        mapRef.current?.remove?.();
      } catch {
        // ignore
      }
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const centerOnUser = async () => {
      if (!isMapReady) return;
      const map = mapRef.current;
      if (!map) return;

      const coords = await fetchUserLocation();
      if (isCancelled || !coords) return;
      if (selectedCityIdRef.current) return;

      map.easeTo({
        center: [coords.longitude, coords.latitude],
        zoom: 11,
        duration: 900,
      });
    };

    void centerOnUser();

    return () => {
      isCancelled = true;
    };
  }, [fetchUserLocation, isMapReady]);

  useEffect(() => {
    if (!isMapReady) return;
    const map = mapRef.current;
    if (!map) return;

    if (!map.getSource("shrubbi-city-stats")) {
      map.addSource("shrubbi-city-stats", {
        type: "geojson",
        data: featureCollection as any,
      });

      map.addLayer({
        id: "shrubbi-city-fill",
        type: "fill",
        source: "shrubbi-city-stats",
        paint: {
          "fill-color": fillColorExpression as any,
          "fill-opacity": 0.55,
        },
      });

      map.addLayer({
        id: "shrubbi-city-outline",
        type: "line",
        source: "shrubbi-city-stats",
        paint: {
          "line-color": COLORS.primary + "B3",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 1.4],
          "line-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "shrubbi-city-outline-selected",
        type: "line",
        source: "shrubbi-city-stats",
        filter: ["==", ["get", "city_id"], selectedCityId ?? ""],
        paint: {
          "line-color": COLORS.primary,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 9, 2.6],
          "line-opacity": 1,
        },
      });

      map.addLayer({
        id: "shrubbi-city-label",
        type: "symbol",
        source: "shrubbi-city-stats",
        minzoom: 7,
        layout: {
          "text-field": ["get", "city_name"],
          "text-size": 12,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": COLORS.secondary,
          "text-halo-color": COLORS.background,
          "text-halo-width": 1,
          "text-halo-blur": 0.6,
        },
      });

      map.on("click", "shrubbi-city-fill", (event: any) => {
        const hit = event?.features?.[0];
        const cityId =
          normalizeCityId(hit?.properties?.city_id) ?? normalizeCityId(hit?.id);
        if (!cityId) return;
        setSelectedCityId(cityId);
      });

      map.on("mouseenter", "shrubbi-city-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "shrubbi-city-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    } else {
      const source = map.getSource("shrubbi-city-stats") as any;
      source?.setData?.(featureCollection as any);
    }

    const userSource = map.getSource("shrubbi-user-location") as any;
    if (!userSource) {
      map.addSource("shrubbi-user-location", {
        type: "geojson",
        data: userLocationFeatureCollection as any,
      });

      map.addLayer({
        id: "shrubbi-user-location-halo",
        type: "circle",
        source: "shrubbi-user-location",
        paint: {
          "circle-radius": 14,
          "circle-color": COLORS.primary,
          "circle-opacity": 0.18,
        },
      });

      map.addLayer({
        id: "shrubbi-user-location-dot",
        type: "circle",
        source: "shrubbi-user-location",
        paint: {
          "circle-radius": 6,
          "circle-color": COLORS.primary,
          "circle-opacity": 0.95,
          "circle-stroke-width": 2,
          "circle-stroke-color": COLORS.background,
        },
      });
    } else {
      userSource?.setData?.(userLocationFeatureCollection as any);
    }
  }, [
    featureCollection,
    fillColorExpression,
    isMapReady,
    selectedCityId,
    userLocationFeatureCollection,
  ]);

  useEffect(() => {
    if (!isMapReady) return;
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("shrubbi-city-fill")) {
      map.setPaintProperty(
        "shrubbi-city-fill",
        "fill-color",
        fillColorExpression as any,
      );
    }
  }, [fillColorExpression, isMapReady]);

  useEffect(() => {
    if (!isMapReady) return;
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("shrubbi-city-outline-selected")) {
      map.setFilter("shrubbi-city-outline-selected", [
        "==",
        ["get", "city_id"],
        selectedCityId ?? "",
      ]);
    }

    if (!selectedCityId) return;

    const row = rows.find((r) => cityIdsMatch(r.city_id, selectedCityId));
    if (!row) return;

    const [centerLon, centerLat] = resolveCityCenter(row);

    const bounds = resolveCityBounds(row, [centerLon, centerLat]);
    map.fitBounds([bounds.sw, bounds.ne], {
      padding: { top: 122, right: 24, bottom: 250, left: 24 },
      duration: 900,
      pitch: 0,
    });
  }, [isMapReady, rows, selectedCityId]);

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
  const globalCo2RemovedKg = useMemo(
    () =>
      rows.reduce(
        (total, row) => total + safeNumber(row.total_co2_removed_kg),
        0,
      ),
    [rows],
  );

  const handleCloseSelected = useCallback(() => {
    setSelectedCityId(null);
  }, []);

  return (
    <View style={styles.container}>
      <View ref={mapContainerRef} style={styles.map} />

      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelTitleWrap}>
              <Text style={styles.panelTitle}>City Pulse</Text>
              <Text style={styles.panelSubTitle}>
                Click a city to see stats. Drag/pinch to explore.
              </Text>
            </View>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zoom to my location"
        disabled={isLocating}
        onPress={handleLocatePress}
        style={styles.locateButton}
      >
        {isLocating ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        )}
      </Pressable>

      <View style={styles.globalCounter}>
        <Text style={styles.globalCounterLabel}>Global CO2 absorbed</Text>
        <Text style={styles.globalCounterValue}>
          {formatKg(globalCo2RemovedKg)}
        </Text>
      </View>

      {selectedCity ? (
        <View style={styles.bottomOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>{selectedCity.city_name}</Text>
                <Text style={styles.sheetSubtitle}>
                  {selectedCity.city_state
                    ? `${selectedCity.city_state} - `
                    : ""}
                  {selectedCity.country_code ?? "US"}
                </Text>
              </View>

              <Pressable
                onPress={handleCloseSelected}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={18} color={COLORS.background} />
              </Pressable>
            </View>

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Plants</Text>
                <Text style={styles.statValue}>
                  {formatCompactNumber(safeNumber(selectedCity.total_plants))}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>People</Text>
                <Text style={styles.statValue}>
                  {formatCompactNumber(safeNumber(selectedCity.member_count))}
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
          </View>
        </View>
      ) : null}
    </View>
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
    paddingTop: 14,
  },
  locateButton: {
    position: "absolute",
    right: 16,
    bottom: 108,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background + "E6",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
    zIndex: 50,
  },
  globalCounter: {
    position: "absolute",
    left: 16,
    bottom: 108,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.background + "EB",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
    zIndex: 50,
  },
  globalCounterLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "700",
    opacity: 0.88,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  globalCounterValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  panel: {
    borderRadius: 18,
    overflow: "hidden",
    padding: 14,
    backgroundColor: COLORS.background + "E6",
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
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    paddingBottom: 18,
  },
  sheet: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: COLORS.background + "F2",
    borderWidth: 1,
    borderColor: COLORS.primary + "1A",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  sheetTitleWrap: {
    flex: 1,
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
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
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
