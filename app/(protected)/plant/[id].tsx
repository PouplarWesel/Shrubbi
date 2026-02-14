import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
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
  type?: string | null;
  types?: string | null;
  plant_type?: { display_name: string } | null;
  is_native: boolean;
  is_endangered: boolean;
  is_invasive: boolean;
};

type PlantDetailRow = {
  id: string;
  user_id: string;
  plant_id: string | null;
  quantity: number;
  planted_on: string;
  photo_path: string | null;
  custom_name: string | null;
  plant: PlantCatalogRow | PlantCatalogRow[] | null;
};

const getExtensionFromUri = (uri: string) => {
  const clean = uri.split("?")[0];
  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1) return "jpg";
  const ext = clean.slice(lastDot + 1).toLowerCase();
  if (!ext || ext.length > 6) return "jpg";
  return ext;
};

export default function PlantDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [plant, setPlant] = useState<PlantDetailRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;
  const userPlantId = typeof id === "string" ? id : null;

  const points = useMemo(() => {
    const quantity = plant?.quantity ?? 1;
    const flags = takeOne(plant?.plant) ?? {};
    return computePlantPoints(flags, quantity);
  }, [plant]);

  const load = useCallback(async () => {
    if (!userId || !userPlantId) return;
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("user_plants")
      .select(
        "id, user_id, plant_id, quantity, planted_on, photo_path, custom_name, plant:plants(common_name, scientific_name, type, plant_type:plant_types(display_name), is_native, is_endangered, is_invasive)",
      )
      .eq("id", userPlantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      setPlant(null);
      setPhotoUrl(null);
      setIsLoading(false);
      return;
    }

    setPlant((data ?? null) as PlantDetailRow | null);
    setIsLoading(false);
  }, [supabase, userId, userPlantId]);

  const loadPhotoUrl = useCallback(
    async (photoPath: string | null | undefined) => {
      if (!photoPath) {
        setPhotoUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("plant-photos")
        .createSignedUrl(photoPath, 60 * 10);

      if (error) {
        setPhotoUrl(null);
        return;
      }

      setPhotoUrl(data.signedUrl);
    },
    [supabase],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPhotoUrl(plant?.photo_path);
  }, [plant?.photo_path, loadPhotoUrl]);

  useEffect(() => {
    if (isEditingName) return;
    const plantRow = plant?.plant?.[0] ?? null;
    setNameDraft(plant?.custom_name || plantRow?.common_name || "");
  }, [isEditingName, plant]);

  const onStartEditName = () => {
    setErrorMessage("");
    setIsEditingName(true);
  };

  const onCancelEditName = () => {
    setErrorMessage("");
    setIsEditingName(false);
  };

  const onSaveName = async () => {
    if (!userId || !userPlantId || !plant || isSavingName) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setErrorMessage("Name cannot be empty.");
      return;
    }

    setErrorMessage("");
    setIsSavingName(true);

    const { error } = await supabase
      .from("user_plants")
      .update({ custom_name: trimmed })
      .eq("id", userPlantId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(error.message);
      setIsSavingName(false);
      return;
    }

    setPlant((prev) => (prev ? { ...prev, custom_name: trimmed } : prev));
    setIsSavingName(false);
    setIsEditingName(false);
  };

  const onPickAndUpload = async () => {
    if (!userId || !userPlantId || isUploading) return;
    setErrorMessage("");
    setIsUploading(true);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled || result.assets.length === 0) {
        setIsUploading(false);
        return;
      }

      const asset = result.assets[0];
      const ext = getExtensionFromUri(asset.uri);
      const objectPath = `${userId}/${userPlantId}.${ext}`;

      const res = await fetch(asset.uri);
      const blob = await res.blob();

      const { error: uploadError } = await supabase.storage
        .from("plant-photos")
        .upload(objectPath, blob, {
          upsert: true,
          contentType: asset.mimeType ?? `image/${ext}`,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message);
        setIsUploading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("user_plants")
        .update({ photo_path: objectPath })
        .eq("id", userPlantId)
        .eq("user_id", userId);

      if (updateError) {
        setErrorMessage(updateError.message);
        setIsUploading(false);
        return;
      }

      setPlant((prev) => (prev ? { ...prev, photo_path: objectPath } : prev));
      await loadPhotoUrl(objectPath);
    } catch {
      setErrorMessage("Could not upload photo.");
    } finally {
      setIsUploading(false);
    }
  };

  const onRemovePlant = () => {
    if (!userId || !userPlantId || isDeleting) return;

    Alert.alert(
      "Remove Plant",
      "This removes the plant from your garden. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setErrorMessage("");
            setIsDeleting(true);

            try {
              const photoPath = plant?.photo_path ?? null;
              if (photoPath) {
                await supabase.storage.from("plant-photos").remove([photoPath]);
              }

              const { error } = await supabase
                .from("user_plants")
                .delete()
                .eq("id", userPlantId)
                .eq("user_id", userId);

              if (error) {
                setErrorMessage(error.message);
                setIsDeleting(false);
                return;
              }

              router.back();
            } catch {
              setErrorMessage("Could not remove plant. Please try again.");
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const plantRow = takeOne(plant?.plant);
  const displayName = plant?.custom_name || plantRow?.common_name || "Plant";
  const scientificName = plantRow?.scientific_name ?? null;
  const typeLabel = plantRow
    ? (plantRow.plant_type?.display_name ??
      plantRow.types ??
      plantRow.type ??
      "Unknown")
    : "Custom";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {isEditingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              placeholder="Plant name"
              placeholderTextColor={COLORS.secondary + "88"}
              style={styles.nameInput}
              returnKeyType="done"
              onSubmitEditing={onSaveName}
            />
            <Pressable
              onPress={onCancelEditName}
              disabled={isSavingName}
              style={styles.nameIconButton}
            >
              <Ionicons name="close" size={20} color={COLORS.secondary} />
            </Pressable>
            <Pressable
              onPress={onSaveName}
              disabled={isSavingName}
              style={[styles.nameIconButton, styles.nameSaveButton]}
            >
              {isSavingName ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={COLORS.background}
                />
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onStartEditName} style={styles.namePressable}>
            <Text style={styles.title}>{displayName}</Text>
            <Ionicons
              name="pencil-outline"
              size={18}
              color={COLORS.secondary}
              style={styles.namePencil}
            />
          </Pressable>
        )}
        {!!scientificName && (
          <Text style={[styles.subtitle, styles.subtitleScientific]}>
            {scientificName}
          </Text>
        )}
        <Text style={styles.subtitle}>Type: {typeLabel}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Points</Text>
          <Text style={styles.pointsValue}>{formatPlantPoints(points)}</Text>
        </View>

        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photo</Text>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons
                name="image-outline"
                size={28}
                color={COLORS.secondary}
              />
              <Text style={styles.placeholderText}>No photo yet</Text>
            </View>
          )}

          <Pressable
            onPress={onPickAndUpload}
            disabled={isUploading}
            style={[styles.primaryButton, isUploading && styles.disabledButton]}
          >
            {isUploading ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color={COLORS.background}
                />
                <Text style={styles.primaryButtonText}>
                  {photoUrl ? "Replace Photo" : "Upload Photo"}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.dangerCard}>
          <Text style={styles.cardTitle}>Danger Zone</Text>
          <Pressable
            onPress={onRemovePlant}
            disabled={isDeleting}
            style={[styles.deleteButton, isDeleting && styles.disabledButton]}
          >
            {isDeleting ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={COLORS.background}
                />
                <Text style={styles.deleteButtonText}>Remove Plant</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.accent + "55",
  },
  backText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
  },
  namePressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  namePencil: {
    marginTop: 8,
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    borderRadius: 12,
    color: COLORS.primary,
    paddingHorizontal: 10,
    minHeight: 44,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    backgroundColor: COLORS.background,
  },
  nameIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  nameSaveButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary + "40",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitleScientific: {
    fontStyle: "italic",
  },
  card: {
    backgroundColor: COLORS.accent + "70",
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  pointsValue: {
    color: COLORS.primary,
    fontSize: 44,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 48,
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.background,
  },
  photoPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.6,
  },
  dangerCard: {
    backgroundColor: COLORS.warning + "22",
    borderWidth: 1,
    borderColor: COLORS.warning + "55",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.warning,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
});
