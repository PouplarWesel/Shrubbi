Map data for the `City Pulse` tab comes from a combination of bespoke columns on `public.cities`, a derived view with aggregates, and two Mapbox-driven React components (native and web). This note summarizes how I discovered, wired, and tested each piece so later agents can reason about the same flow.

1. **How the raw data is prepared (`sql/city_map_stats.sql`:1-865).**
   - The migration first adds six envelope columns (`center_lat`, `center_lon`, `bbox_*`) to `public.cities` so we can draw a rough rectangle per city instead of relying on heavy geometry. The comment at the top (`-- 70 city geo updates generated from tmp_city_venues.json + tmp_cities.json`) points at the raw sources.
   - Those JSON files live at the repo root: `tmp_cities.json` lists the city IDs/names, while `tmp_city_venues.json` maps each city ID to a handful of `parks` + `school` points with dedicated `lat`/`lon`. When building the updates I computed each city’s envelope by taking the min/max latitude/longitude across all venues and averaging those min/max pairs for the center columns. The generated SQL file now contains the explicit numeric values (`UPDATE public.cities SET … WHERE lower(name) = lower('City') …`) so the migration is the version of record.
   - To regenerate/append this data for a new city, export a representative set of venues (parks, schools, large public spaces) from OpenStreetMap (e.g., via Overpass Turbo or its API) filtered inside that city boundary. Save the resulting lat/lon points to the `tmp_city_venues.json` structure, add the city metadata into `tmp_cities.json`, and recompute the min/max lat/lon to produce a new block. Keep the same `lower(name)`/`lower(state)`/`upper(country_code)` conditions so the migration is deterministic.
   - After the updates, the same file defines `public.city_map_stats` (lines 781‑865). It aggregates:
     * Member count via `public.profiles` (city-level counts).
     * Plant counts and CO₂ math via `public.user_plants` joined to `public.plants`.
     * Plant-type breakdowns via `city_type_counts` → `city_type_agg`, which produces `type_breakdown`, `best_plant_type`, etc.
   - The view also re‑exposes the new envelope columns and `boundary_geojson`, so downstream consumers can choose between precise shapes and fallback bounding boxes.

2. **How `MapTab` (native) consumes the view (`components/Map/MapTab.tsx`:220-520).**
   - The effect starting around line 220 fetches `city_map_stats` via Supabase and keeps the rows in local state. Errors log whether the view is missing so migrations can be applied.
   - Lines 282‑357 build a Mapbox `FeatureCollection` from the rows: prefer `boundary_geojson`, otherwise construct a polygon out of the envelope columns with a fallback box (`FALLBACK_BOX_DEG`). Each feature stores the aggregated score (CO₂/plant/members) plus the metadata used in the legend modal.
   - The map uses that collection to drive `FillLayer` + `LineLayer` styling and handles taps via `handleSourcePress` (lines 416‑429). `fillColorExpression` and `maxScore` control the choropleth colors so the gradient scales with whichever metric is selected.
   - The camera initialization (lines 423‑500) freezes pitch at 0 and never loads 3D buildings; the controls now include only the metric selector.

3. **How geolocation and user location UI work (native lines 443‑520, 578‑620).**
   - `fetchUserLocation` wraps `expo-location` permissions (with fallback to `navigator.geolocation` on web) and keeps the last-good coords in `userLocation`.
   - A synthetic `ShapeSource`/`CircleLayer` pair at lines 443‑495 renders a halo + dot when we have coordinates, and the locate button (lines 514‑520) lets the user re-center with a fresh GPS fix.
   - The `locate` button sits above the controls (`styles.locateButton`) so it survives bottom inset changes.

4. **How the web version mirrors the logic (`components/Map/MapTab.web.tsx`:173-695).**
   - Web still fetches `city_map_stats`, builds the same `FeatureCollection`, and colors it with identical expressions (lines 300‑371).
   - It loads Mapbox GL JS manually (lines 373‑528) and follows the same layer structure for fills/outlines/labels (lines 571‑688) plus extra circle layers for the locate marker.
   - Web also auto-centers to the user after the map becomes ready (lines 545‑569) and exposes a static locate button (lines 734‑811) that calls `map.easeTo` after refreshing the location (lines 364‑476). The fallback geolocation path inside `fetchUserLocation` handles browsers that don’t support `navigator.geolocation`.

5. **Next steps for future agents.**
   - To adjust the envelope geometry, edit `sql/city_map_stats.sql` (the updates near the top) or replace them with a script that reads `tmp_city_venues.json`/`tmp_cities.json`. After editing, re-run the migration so the columns exist before the view is used.
   - If the metrics need more fields, extend the `city_map_stats` view (lines 781‑865) and update both MapTab components so `featureCollection` includes the new properties.
   - Mapbox styling lives in `components/Map/MapTab.tsx:423-520` and `.web.tsx:571-688`; keep the fill/line/circle layers in sync when you change theme or add layers.
   - The locate button/camera logic assumes the view returns a consistent `center_lat/lon` for each city; if that assumption changes, adjust `handleSelectCity`/`handleSourcePress` (native lines 361‑429) and the web equivalents (lines 623‑650).
