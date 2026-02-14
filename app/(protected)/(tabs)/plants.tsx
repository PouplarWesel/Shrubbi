import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import { computePlantPoints, formatPlantPoints } from "@/lib/plantPoints";

function takeOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type PlantCatalogRow = {
  common_name: string;
  scientific_name: string | null;
  // DB column naming has drifted in this project; accept both.
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
  plant: PlantCatalogRow | PlantCatalogRow[] | null;
};

export default function PlantsPage() {
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [plants, setPlants] = useState<UserPlantRow[]>([]);

  const userId = session?.user?.id ?? null;

  const loadPlants = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("user_plants")
      .select(
        "id, plant_id, custom_name, quantity, planted_on, notes, plant:plants(common_name, scientific_name, type, plant_type:plant_types(display_name), is_native, is_endangered, is_invasive)",
      )
      .eq("user_id", userId)
      .order("planted_on", { ascending: false });

    if (error) {
      setErrorMessage(`Could not load your plants: ${error.message}`);
      setIsLoading(false);
      return;
    }

    setPlants((data ?? []) as unknown as UserPlantRow[]);
    setIsLoading(false);
  }, [supabase, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadPlants();
    }, [loadPlants]),
  );

  const plantCount = useMemo(
    () => plants.reduce((sum, plant) => sum + plant.quantity, 0),
    [plants],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>My Plants</Text>
        <Text style={styles.subtitle}>Total plants tracked: {plantCount}</Text>

        <View style={styles.card}>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/(protected)/add-plant")}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={COLORS.background}
            />
            <Text style={styles.addButtonText}>Add Plant</Text>
          </Pressable>
        </View>

        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current Plants</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : plants.length === 0 ? (
            <Text style={styles.emptyText}>
              No plants yet. Add your first one above.
            </Text>
          ) : (
            plants.map((item) => {
              const plant = takeOne(item.plant);
              const displayName =
                item.custom_name || plant?.common_name || "Unnamed plant";
              const scientificName = plant?.scientific_name ?? null;
              const typeLabel = plant
                ? (plant.plant_type?.display_name ??
                  plant.types ??
                  plant.type ??
                  "Unknown")
                : "Custom";
              const points = computePlantPoints(plant ?? {}, item.quantity);
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: "/(protected)/plant/[id]",
                      params: { id: item.id },
                    })
                  }
                  style={styles.plantRow}
                >
                  <View style={styles.plantNameBlock}>
                    <Text style={styles.plantName}>{displayName}</Text>
                    {!!scientificName && (
                      <Text style={styles.plantScientific}>
                        {scientificName}
                      </Text>
                    )}
                    <Text style={styles.plantType}>Type: {typeLabel}</Text>
                    <Text style={styles.plantMeta}>
                      Qty: {item.quantity} | Points: {formatPlantPoints(points)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={COLORS.primary}
                  />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
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
    gap: 12,
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  card: {
    backgroundColor: COLORS.accent + "70",
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  addButton: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  loadingRow: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  plantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.background,
  },
  plantNameBlock: {
    flex: 1,
    gap: 2,
  },
  plantName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  plantScientific: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    fontStyle: "italic",
  },
  plantType: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  plantMeta: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
});
