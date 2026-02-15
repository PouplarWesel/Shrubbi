import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import { readCachedValue, writeCachedValue } from "@/lib/localCache";
import { computePlantPoints, formatPlantPoints } from "@/lib/plantPoints";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = (width - 40 - 12) / 2;
const BRONZE = "#CD7F32";
const SILVER = "#C0C0C0";
const GOLD = "#D4AF37";
const SILVER_MIN_ACHIEVEMENTS = 3;
const GOLD_MIN_ACHIEVEMENTS = 5;

function takeOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type PlantCatalogRow = {
  common_name: string;
  scientific_name: string | null;
  default_co2_kg_per_year?: number | null;
  type?: string | null;
  types?: string | null;
  plant_type?: { display_name: string } | null;
  is_native: boolean;
  is_endangered: boolean;
  is_invasive: boolean;
};

type UserPlantRow = {
  id: string;
  plant_id: string | null;
  custom_name: string | null;
  quantity: number;
  planted_on: string;
  notes: string | null;
  watering_points: number | null;
  plant: PlantCatalogRow | PlantCatalogRow[] | null;
};

type PlantsCachePayload = {
  earnedAchievementCount: number;
  plants: UserPlantRow[];
};

export default function PlantsPage() {
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [plants, setPlants] = useState<UserPlantRow[]>([]);
  const [earnedAchievementCount, setEarnedAchievementCount] = useState(0);

  const userId = session?.user?.id ?? null;
  const plantsCacheKey = userId ? `plants:overview:${userId}` : null;

  useEffect(() => {
    if (!plantsCacheKey) return;

    let isCancelled = false;

    const hydrateFromCache = async () => {
      const cached = await readCachedValue<PlantsCachePayload>(
        plantsCacheKey,
        24 * 60 * 60 * 1000,
      );
      if (!cached || isCancelled) return;

      setPlants(cached.plants);
      setEarnedAchievementCount(cached.earnedAchievementCount);
      setIsLoading(false);
    };

    void hydrateFromCache();

    return () => {
      isCancelled = true;
    };
  }, [plantsCacheKey]);

  const loadPlants = useCallback(async () => {
    if (!userId) return;
    if (plants.length === 0) {
      setIsLoading(true);
    }
    setErrorMessage("");

    const [{ data, error }, { count, error: achievementError }] =
      await Promise.all([
        supabase
          .from("user_plants")
          .select(
            "id, plant_id, custom_name, quantity, planted_on, notes, watering_points, plant:plants(common_name, scientific_name, default_co2_kg_per_year, type, plant_type:plant_types(display_name), is_native, is_endangered, is_invasive)",
          )
          .eq("user_id", userId)
          .order("planted_on", { ascending: false }),
        supabase
          .from("user_achievements")
          .select("achievement_id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

    if (error || achievementError) {
      const message =
        error?.message ?? achievementError?.message ?? "Unknown error";
      setErrorMessage(`Could not load your garden data: ${message}`);
      setIsLoading(false);
      return;
    }

    setPlants((data ?? []) as unknown as UserPlantRow[]);
    setEarnedAchievementCount(count ?? 0);
    if (plantsCacheKey) {
      void writeCachedValue<PlantsCachePayload>(plantsCacheKey, {
        earnedAchievementCount: count ?? 0,
        plants: (data ?? []) as unknown as UserPlantRow[],
      });
    }
    setIsLoading(false);
  }, [plants.length, plantsCacheKey, supabase, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadPlants();
    }, [loadPlants]),
  );

  const plantCount = useMemo(
    () => plants.reduce((sum, plant) => sum + plant.quantity, 0),
    [plants],
  );
  const totalPoints = useMemo(
    () =>
      plants.reduce((sum, item) => {
        const plant = takeOne(item.plant);
        const basePoints = computePlantPoints(plant ?? {}, item.quantity);
        const wateringPoints = item.watering_points ?? 0;
        return sum + basePoints + wateringPoints;
      }, 0),
    [plants],
  );
  const levelInfo = useMemo(() => {
    if (
      totalPoints >= 1000 &&
      earnedAchievementCount >= GOLD_MIN_ACHIEVEMENTS
    ) {
      return { level: 3, tier: "Old Growth", color: GOLD };
    }
    if (
      totalPoints >= 100 &&
      earnedAchievementCount >= SILVER_MIN_ACHIEVEMENTS
    ) {
      return { level: 2, tier: "Evergreen", color: SILVER };
    }
    return { level: 1, tier: "Seedling", color: BRONZE };
  }, [earnedAchievementCount, totalPoints]);
  const levelRequirementText = useMemo(() => {
    if (totalPoints < 100) {
      return `Need ${formatPlantPoints(100 - totalPoints)} more pts and ${Math.max(SILVER_MIN_ACHIEVEMENTS - earnedAchievementCount, 0)} more achievements for Evergreen`;
    }
    if (earnedAchievementCount < SILVER_MIN_ACHIEVEMENTS) {
      return `Need ${SILVER_MIN_ACHIEVEMENTS - earnedAchievementCount} more achievements for Evergreen`;
    }
    if (totalPoints < 1000) {
      return `Need ${formatPlantPoints(1000 - totalPoints)} more pts and ${Math.max(GOLD_MIN_ACHIEVEMENTS - earnedAchievementCount, 0)} more achievements for Old Growth`;
    }
    if (earnedAchievementCount < GOLD_MIN_ACHIEVEMENTS) {
      return `Need ${GOLD_MIN_ACHIEVEMENTS - earnedAchievementCount} more achievements for Old Growth`;
    }
    return "Old Growth requirements met";
  }, [earnedAchievementCount, totalPoints]);

  const getPlantIcon = (type?: string | null) => {
    const t = type?.toLowerCase() || "";
    if (t.includes("tree")) return "sunny";
    if (t.includes("flower") || t.includes("shrub")) return "flower";
    if (t.includes("grass")) return "leaf";
    return "leaf";
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>My Garden</Text>
            <Text style={styles.subtitle}>
              Blooming with {plantCount} {plantCount === 1 ? "plant" : "plants"}
            </Text>
            <Text style={styles.pointsSummary}>
              Total points: {formatPlantPoints(totalPoints)} pts
            </Text>
            <Text style={styles.pointsSummary}>
              Achievements: {earnedAchievementCount}
            </Text>
            <Text style={styles.levelRequirementText}>
              {levelRequirementText}
            </Text>
          </View>
          <View
            style={[styles.statBadge, { borderColor: levelInfo.color + "60" }]}
          >
            <Ionicons name="trophy" size={16} color={COLORS.primary} />
            <Text style={styles.statText}>
              Lvl {levelInfo.level} {levelInfo.tier}
            </Text>
          </View>
        </View>

        {!!errorMessage && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Collection</Text>
          <Pressable onPress={() => void loadPlants()}>
            <Ionicons name="refresh" size={20} color={COLORS.primary} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Tending to your garden...</Text>
          </View>
        ) : plants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="leaf-outline"
              size={64}
              color={COLORS.secondary + "40"}
            />
            <Text style={styles.emptyText}>
              Your garden is waiting for its first seeds.
            </Text>
            <Pressable
              style={styles.emptyAddButton}
              onPress={() => router.push("/(protected)/add-plant")}
            >
              <Text style={styles.emptyAddButtonText}>Plant Something</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.plantGrid}>
            {plants.map((item) => {
              const plant = takeOne(item.plant);
              const displayName =
                item.custom_name || plant?.common_name || "Unnamed plant";
              const typeLabel = plant
                ? (plant.plant_type?.display_name ??
                  plant.types ??
                  plant.type ??
                  "Unknown")
                : "Custom";
              const points = computePlantPoints(plant ?? {}, item.quantity);
              const totalPlantPoints = points + (item.watering_points ?? 0);

              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: "/(protected)/plant/[id]",
                      params: { id: item.id },
                    })
                  }
                  style={styles.plantCard}
                >
                  <LinearGradient
                    colors={[COLORS.accent + "90", COLORS.accent + "40"]}
                    style={styles.cardGradient}
                  >
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={getPlantIcon(typeLabel)}
                        size={32}
                        color={COLORS.primary}
                      />
                    </View>

                    <View style={styles.cardInfo}>
                      <Text style={styles.plantName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={styles.plantType} numberOfLines={1}>
                        {typeLabel}
                      </Text>

                      <View style={styles.cardFooter}>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyText}>x{item.quantity}</Text>
                        </View>
                        <Text style={styles.pointsText}>
                          {formatPlantPoints(totalPlantPoints)} pts
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 100 }]}
        onPress={() => router.push("/(protected)/add-plant")}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={32} color={COLORS.background} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  title: {
    color: COLORS.primary,
    fontSize: 40,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 44,
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  pointsSummary: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  levelRequirementText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    flexShrink: 0,
  },
  statText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: COLORS.secondary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warning + "20",
    padding: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.warning + "40",
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    flex: 1,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
  emptyAddButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  emptyAddButtonText: {
    color: COLORS.background,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  plantGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  plantCard: {
    width: COLUMN_WIDTH,
    height: 180,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  cardGradient: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  iconContainer: {
    width: 56,
    height: 56,
    backgroundColor: COLORS.background + "80",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    gap: 2,
  },
  plantName: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  plantType: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  qtyBadge: {
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qtyText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  pointsText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  fabGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
