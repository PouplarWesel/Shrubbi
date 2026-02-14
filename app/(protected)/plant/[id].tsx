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
import { LinearGradient } from "expo-linear-gradient";

import { CameraCapture } from "@/components/CameraCapture";
import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import {
  decodeBase64ToBytes,
  getFileExtension,
  readImageUriAsBlob,
} from "@/lib/imageUpload";
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

export default function PlantDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session, supabase } = useSupabase();

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
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
    const plantRow = takeOne(plant?.plant);
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

  const uploadPlantPhotoAsset = useCallback(
    async (source: { uri: string; mimeType?: string | null; base64?: string | null }) => {
      if (!userId || !userPlantId || isUploading) return;
      setErrorMessage("");
      setIsUploading(true);

      const { uri, mimeType, base64 } = source;
      const ext = getFileExtension(uri, mimeType);
      const objectPath = `${userId}/${userPlantId}.${ext}`;

      try {
        const imageBody = base64
          ? decodeBase64ToBytes(base64)
          : await readImageUriAsBlob(uri);

        const { error: uploadError } = await supabase.storage
          .from("plant-photos")
          .upload(objectPath, imageBody, {
            cacheControl: "3600",
            upsert: true,
            contentType: mimeType ?? `image/${ext}`,
          });

        if (uploadError) {
          setErrorMessage(uploadError.message);
          return;
        }

        const { error: updateError } = await supabase
          .from("user_plants")
          .update({ photo_path: objectPath })
          .eq("id", userPlantId)
          .eq("user_id", userId);

        if (updateError) {
          setErrorMessage(updateError.message);
          return;
        }

        setPlant((prev) => (prev ? { ...prev, photo_path: objectPath } : prev));
        await loadPhotoUrl(objectPath);
      } catch (error) {
        setErrorMessage("Could not upload photo.");
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, loadPhotoUrl, supabase, userId, userPlantId],
  );

  const onPickAndUploadFromLibrary = async () => {
    if (!userId || !userPlantId || isUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets.length) return;
    const [asset] = result.assets;
    await uploadPlantPhotoAsset({ uri: asset.uri, mimeType: asset.mimeType, base64: asset.base64 });
  };

  const onOpenCamera = () => setIsCameraOpen(true);
  const onCameraClose = () => setIsCameraOpen(false);
  const onCameraCapture = (uri: string, mimeType: string, base64?: string | null) => {
    void uploadPlantPhotoAsset({ uri, mimeType, base64 });
    setIsCameraOpen(false);
  };

  const onRemovePlant = () => {
    if (!userId || !userPlantId || isDeleting) return;
    Alert.alert("Remove Plant", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setIsDeleting(true);
          const { error } = await supabase
            .from("user_plants")
            .delete()
            .eq("id", userPlantId);
          if (error) {
            setErrorMessage(error.message);
            setIsDeleting(false);
          } else {
            router.back();
          }
        },
      },
    ]);
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
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          <Text style={styles.backButtonText}>Garden</Text>
        </Pressable>

        <View style={styles.header}>
          {isEditingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                style={styles.nameInput}
                onSubmitEditing={onSaveName}
              />
              <Pressable onPress={onSaveName} style={styles.iconButton}>
                <Ionicons name="checkmark" size={24} color={COLORS.primary} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={onStartEditName} style={styles.nameDisplayRow}>
              <Text style={styles.title}>{displayName}</Text>
              <Ionicons name="pencil" size={18} color={COLORS.secondary} />
            </Pressable>
          )}
          {scientificName && <Text style={styles.scientificName}>{scientificName}</Text>}
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{typeLabel}</Text>
          </View>
        </View>

        <View style={styles.photoContainer}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.mainPhoto} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="leaf" size={64} color={COLORS.accent} />
              <Text style={styles.photoPlaceholderText}>Add a photo of your {displayName}</Text>
            </View>
          )}
          <View style={styles.photoActions}>
            <Pressable style={styles.photoActionButton} onPress={onOpenCamera}>
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.actionGradient}>
                <Ionicons name="camera" size={24} color={COLORS.background} />
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.photoActionButton} onPress={onPickAndUploadFromLibrary}>
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.actionGradient}>
                <Ionicons name="images" size={24} color={COLORS.background} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Points</Text>
            <Text style={styles.statValue}>{formatPlantPoints(points)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Quantity</Text>
            <Text style={styles.statValue}>x{plant?.quantity || 1}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Planted On</Text>
          </View>
          <Text style={styles.cardContent}>{plant?.planted_on}</Text>
        </View>

        {!!errorMessage && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Pressable onPress={onRemovePlant} style={styles.removeButton}>
          <Ionicons name="trash-outline" size={20} color={COLORS.warning} />
          <Text style={styles.removeButtonText}>Remove from Garden</Text>
        </Pressable>
      </ScrollView>

      {isCameraOpen && (
        <View style={styles.cameraOverlay}>
          <CameraCapture
            onCapture={onCameraCapture}
            onClose={onCameraClose}
            defaultFacing="back"
            titleText="Plant Photo"
            hintText="Snap a picture of your plant"
          />
        </View>
      )}
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
    gap: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  header: {
    gap: 4,
  },
  title: {
    color: COLORS.primary,
    fontSize: 38,
    fontFamily: "Boogaloo_400Regular",
  },
  nameDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameInput: {
    flex: 1,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
    color: COLORS.primary,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingVertical: 0,
  },
  iconButton: {
    padding: 8,
  },
  scientificName: {
    color: COLORS.text,
    fontSize: 18,
    fontStyle: "italic",
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  typeBadge: {
    backgroundColor: COLORS.accent + "50",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
  },
  typeText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  photoContainer: {
    width: "100%",
    height: 300,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: COLORS.accent + "30",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  mainPhoto: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  photoPlaceholderText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
  photoActions: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    gap: 12,
  },
  photoActionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  actionGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.accent + "40",
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    gap: 4,
  },
  statLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  statValue: {
    color: COLORS.primary,
    fontSize: 28,
    fontFamily: "Boogaloo_400Regular",
  },
  card: {
    backgroundColor: COLORS.accent + "30",
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.secondary + "15",
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    color: COLORS.secondary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  cardContent: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
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
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
  },
  removeButtonText: {
    color: COLORS.warning,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
});
