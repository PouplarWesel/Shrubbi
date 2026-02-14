import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type PlantSearchResult = {
  plant_id: string;
  common_name: string;
  scientific_name: string | null;
  matched_name: string;
  match_source: string;
};

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

export default function AddPlantPage() {
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [isNicknameDirty, setIsNicknameDirty] = useState(false);
  const [quantityInput, setQuantityInput] = useState("1");
  const [dateInput, setDateInput] = useState(getTodayIsoDate());
  const [notesInput, setNotesInput] = useState("");
  const [isSearchingPlants, setIsSearchingPlants] = useState(false);
  const [plantSuggestions, setPlantSuggestions] = useState<PlantSearchResult[]>(
    [],
  );
  const [selectedPlant, setSelectedPlant] = useState<PlantSearchResult | null>(
    null,
  );
  const [showPlantSuggestions, setShowPlantSuggestions] = useState(false);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    const query = nameInput.trim();
    if (!showPlantSuggestions || query.length < 2) {
      setPlantSuggestions([]);
      setIsSearchingPlants(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingPlants(true);

    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_plants", {
        search_text: query,
        max_results: 8,
      });

      if (isCancelled) return;

      if (error) {
        setPlantSuggestions([]);
        setIsSearchingPlants(false);
        return;
      }

      setPlantSuggestions((data ?? []) as PlantSearchResult[]);
      setIsSearchingPlants(false);
    }, 220);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [nameInput, showPlantSuggestions, supabase]);

  const onChangePlantName = (value: string) => {
    setNameInput(value);
    setSelectedPlant(null);
    setShowPlantSuggestions(true);
    if (!isNicknameDirty && !nicknameInput.trim()) {
      setNicknameInput(value);
    }
  };

  const onSelectPlantSuggestion = (plant: PlantSearchResult) => {
    setSelectedPlant(plant);
    setNameInput(plant.common_name);
    if (!isNicknameDirty) {
      setNicknameInput(plant.common_name);
    }
    setPlantSuggestions([]);
    setShowPlantSuggestions(false);
  };

  const onAddPlant = async () => {
    if (!userId || isSaving) return;
    const trimmedName = nameInput.trim();
    const trimmedNickname = nicknameInput.trim() || trimmedName;
    const trimmedNotes = notesInput.trim();
    const parsedQuantity = Number.parseInt(quantityInput, 10);
    const parsedDate = dateInput.trim();

    if (!trimmedName) {
      setErrorMessage("Plant name is required.");
      return;
    }
    if (!trimmedNickname) {
      setErrorMessage("Plant name is required.");
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("Quantity must be a positive number.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      setErrorMessage("Use date format YYYY-MM-DD.");
      return;
    }

    setErrorMessage("");
    setIsSaving(true);

    let matchedPlant = selectedPlant;
    if (!matchedPlant) {
      const { data: matchedPlants, error: findPlantError } = await supabase.rpc(
        "search_plants",
        {
          search_text: trimmedName,
          max_results: 1,
        },
      );

      if (findPlantError) {
        setErrorMessage(findPlantError.message);
        setIsSaving(false);
        return;
      }

      matchedPlant = (matchedPlants?.[0] ?? null) as PlantSearchResult | null;
    }

    const { error } = await supabase.from("user_plants").insert({
      user_id: userId,
      plant_id: matchedPlant?.plant_id ?? null,
      // Store the user's chosen plant name (nickname). Default is the plant type name.
      custom_name: trimmedNickname,
      quantity: parsedQuantity,
      planted_on: parsedDate,
      notes: trimmedNotes || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 28,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Add Plant</Text>
        <Text style={styles.subtitle}>
          Search plants from catalog, then save to your garden.
        </Text>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Plant Type</Text>
          <TextInput
            value={nameInput}
            onChangeText={onChangePlantName}
            onFocus={() => setShowPlantSuggestions(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowPlantSuggestions(false);
              }, 120);
            }}
            placeholder="Start typing plant name..."
            placeholderTextColor={COLORS.secondary + "88"}
            style={styles.input}
          />
          {showPlantSuggestions && (
            <View style={styles.suggestionsCard}>
              {isSearchingPlants ? (
                <View style={styles.suggestionsLoading}>
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : plantSuggestions.length === 0 ? (
                <Text style={styles.suggestionEmptyText}>
                  Keep typing to find a plant in the catalog.
                </Text>
              ) : (
                plantSuggestions.map((plant) => (
                  <Pressable
                    key={plant.plant_id}
                    style={styles.suggestionItem}
                    onPress={() => onSelectPlantSuggestion(plant)}
                  >
                    <Text style={styles.suggestionName}>
                      {plant.common_name}
                    </Text>
                    {!!plant.scientific_name && (
                      <Text style={styles.suggestionMeta}>
                        {plant.scientific_name}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={nicknameInput}
            onChangeText={(value) => {
              setNicknameInput(value);
              setIsNicknameDirty(true);
            }}
            placeholder="Default: plant type name"
            placeholderTextColor={COLORS.secondary + "88"}
            style={styles.input}
          />

          <View style={styles.inlineInputs}>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Quantity</Text>
              <TextInput
                value={quantityInput}
                onChangeText={setQuantityInput}
                placeholder="1"
                placeholderTextColor={COLORS.secondary + "88"}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Planted On</Text>
              <TextInput
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.secondary + "88"}
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            value={notesInput}
            onChangeText={setNotesInput}
            placeholder="Optional notes"
            placeholderTextColor={COLORS.secondary + "88"}
            style={[styles.input, styles.notesInput]}
            multiline
          />

          {!!errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}

          <Pressable
            style={[styles.addButton, isSaving && styles.disabledButton]}
            onPress={onAddPlant}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={COLORS.background}
                />
                <Text style={styles.addButtonText}>Save Plant</Text>
              </>
            )}
          </Pressable>
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
  fieldLabel: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 8,
  },
  inlineField: {
    flex: 1,
    gap: 4,
  },
  suggestionsCard: {
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 10,
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
  suggestionsLoading: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary + "20",
  },
  suggestionName: {
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  suggestionMeta: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  suggestionEmptyText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    borderRadius: 10,
    color: COLORS.primary,
    paddingHorizontal: 10,
    minHeight: 40,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    backgroundColor: COLORS.background,
  },
  notesInput: {
    minHeight: 72,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  addButton: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  addButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
});
