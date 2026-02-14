import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type PlantSearchResult = {
  plant_id: string;
  common_name: string;
  scientific_name: string | null;
  matched_name: string;
  match_source: string;
  type?: string | null;
};

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

export default function AddPlantPage() {
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();
  const [step, setStep] = useState<1 | 2>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Search State (Step 1)
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingPlants, setIsSearchingPlants] = useState(false);
  const [plantSuggestions, setPlantSuggestions] = useState<PlantSearchResult[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<PlantSearchResult | null>(null);

  // Details State (Step 2)
  const [nicknameInput, setNicknameInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [dateInput, setDateInput] = useState(getTodayIsoDate());
  const [notesInput, setNotesInput] = useState("");

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    const query = searchQuery.trim();
    if (step !== 1 || query.length < 2) {
      setPlantSuggestions([]);
      setIsSearchingPlants(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingPlants(true);

    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_plants", {
        search_text: query,
        max_results: 10,
      });

      if (isCancelled) return;

      if (error) {
        setPlantSuggestions([]);
        setIsSearchingPlants(false);
        return;
      }

      setPlantSuggestions((data ?? []) as PlantSearchResult[]);
      setIsSearchingPlants(false);
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, step, supabase]);

  const onSelectPlant = (plant: PlantSearchResult) => {
    setSelectedPlant(plant);
    setNicknameInput(plant.common_name);
    setStep(2);
  };

  const onAddPlant = async () => {
    if (!userId || isSaving) return;
    const trimmedNickname = nicknameInput.trim();
    const trimmedNotes = notesInput.trim();
    const parsedQuantity = Number.parseInt(quantityInput, 10);
    const parsedDate = dateInput.trim();

    if (!trimmedNickname) {
      setErrorMessage("Please give your plant a nickname.");
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

    const { error } = await supabase.from("user_plants").insert({
      user_id: userId,
      plant_id: selectedPlant?.plant_id ?? null,
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

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Find a Plant</Text>
      <Text style={styles.subtitle}>Search our catalog for the species you're planting.</Text>
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.primary} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="e.g. Lavender, Tomato, Oak..."
          placeholderTextColor={COLORS.secondary + "80"}
          style={styles.searchInput}
          autoFocus
        />
      </View>

      <ScrollView 
        style={styles.resultsList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isSearchingPlants ? (
          <View style={styles.centerContent}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.infoText}>Digging through the catalog...</Text>
          </View>
        ) : searchQuery.length < 2 ? (
          <View style={styles.centerContent}>
            <Ionicons name="leaf" size={48} color={COLORS.accent} />
            <Text style={styles.infoText}>Type to start searching</Text>
          </View>
        ) : plantSuggestions.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="search-outline" size={48} color={COLORS.accent} />
            <Text style={styles.infoText}>No plants found matching "{searchQuery}"</Text>
            <Pressable 
              style={styles.customAddButton}
              onPress={() => {
                setSelectedPlant(null);
                setNicknameInput(searchQuery);
                setStep(2);
              }}
            >
              <Text style={styles.customAddButtonText}>Add as Custom Plant</Text>
            </Pressable>
          </View>
        ) : (
          plantSuggestions.map((plant) => (
            <Pressable
              key={plant.plant_id}
              style={styles.resultItem}
              onPress={() => onSelectPlant(plant)}
            >
              <View style={styles.resultIcon}>
                <Ionicons name="leaf" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.resultText}>
                <Text style={styles.resultName}>{plant.common_name}</Text>
                {!!plant.scientific_name && (
                  <Text style={styles.resultScientific}>{plant.scientific_name}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.secondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Pressable style={styles.backButton} onPress={() => setStep(1)}>
        <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        <Text style={styles.backButtonText}>Back to search</Text>
      </Pressable>

      <Text style={styles.title}>Plant Details</Text>
      <Text style={styles.subtitle}>
        {selectedPlant ? `Adding ${selectedPlant.common_name}` : "Adding a custom plant"}
      </Text>

      <ScrollView 
        style={styles.formScroll} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.formContent}
      >
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nickname</Text>
          <TextInput
            value={nicknameInput}
            onChangeText={setNicknameInput}
            placeholder="e.g. My Front Yard Oak"
            placeholderTextColor={COLORS.secondary + "80"}
            style={styles.input}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              value={quantityInput}
              onChangeText={setQuantityInput}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 2 }]}>
            <Text style={styles.label}>Planted On</Text>
            <TextInput
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.secondary + "80"}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notesInput}
            onChangeText={setNotesInput}
            placeholder="Where is it? How's it doing?"
            placeholderTextColor={COLORS.secondary + "80"}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={4}
          />
        </View>

        {!!errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Pressable
          style={[styles.saveButton, isSaving && styles.disabledButton]}
          onPress={onAddPlant}
          disabled={isSaving}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saveGradient}
          >
            {isSaving ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.background} />
                <Text style={styles.saveButtonText}>Confirm Planting</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={[styles.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
        {step === 1 ? renderStep1() : renderStep2()}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 4,
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
    marginBottom: 24,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "50",
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 56,
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  resultsList: {
    flex: 1,
  },
  centerContent: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  infoText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
  customAddButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  customAddButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "30",
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary + "15",
  },
  resultIcon: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  resultScientific: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    fontStyle: "italic",
    opacity: 0.7,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    gap: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  label: {
    color: COLORS.secondary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  input: {
    backgroundColor: COLORS.accent + "30",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  textArea: {
    height: 120,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warning + "15",
    padding: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.warning + "30",
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    flex: 1,
  },
  saveButton: {
    borderRadius: 26,
    overflow: "hidden",
    marginTop: 10,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  saveGradient: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveButtonText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
