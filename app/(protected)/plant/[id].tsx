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
import {
  computePlantPoints,
  formatPlantPoints,
  WATERING_POINTS_PER_PLANT,
} from "@/lib/plantPoints";
import { syncWateringRemindersForUserAsync } from "@/lib/wateringNotifications";
import {
  formatWaterDays,
  formatWaterTime,
  getLatestScheduledAt,
  isValidWaterTimeInput,
  normalizeWaterDays,
  normalizeWaterTimeForInput,
  parseWaterTimeToMinutes,
  WEEKDAY_OPTIONS,
} from "@/lib/wateringSchedule";

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

type PlantDetailRow = {
  id: string;
  user_id: string;
  plant_id: string | null;
  quantity: number;
  planted_on: string;
  notes: string | null;
  photo_path: string | null;
  custom_name: string | null;
  water_days: number[] | null;
  water_time: string | null;
  last_watered_at: string | null;
  watering_points: number | null;
  plant: PlantCatalogRow | PlantCatalogRow[] | null;
};

const MERIDIEM_OPTIONS = ["AM", "PM"] as const;
type Meridiem = (typeof MERIDIEM_OPTIONS)[number];

const formatTimeInputFromDigits = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const normalizeTimeInputOnBlur = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits.length) return "";
  if (digits.length === 1) return `0${digits}`;
  if (digits.length === 2) return digits;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const convert24HourToDraft = (
  value: string | null | undefined,
): { timeText: string; meridiem: Meridiem } => {
  const normalizedTime = normalizeWaterTimeForInput(value);
  const minutes = parseWaterTimeToMinutes(normalizedTime);
  if (minutes == null) {
    return { timeText: "", meridiem: "AM" };
  }

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const meridiem: Meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    timeText: `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    meridiem,
  };
};

const convertDraftTo24Hour = (
  timeDraft: string,
  meridiem: Meridiem,
): string | null => {
  const digits = timeDraft.replace(/\D/g, "");
  if (digits.length !== 4) return null;

  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2, 4));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const hour24 =
    meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;

  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [plant, setPlant] = useState<PlantDetailRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [waterDaysDraft, setWaterDaysDraft] = useState<number[]>([]);
  const [waterTimeDraft, setWaterTimeDraft] = useState("");
  const [timeMeridiemDraft, setTimeMeridiemDraft] = useState<Meridiem>("AM");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const userId = session?.user?.id ?? null;
  const userPlantId = typeof id === "string" ? id : null;

  const points = useMemo(() => {
    const quantity = plant?.quantity ?? 1;
    const flags = takeOne(plant?.plant) ?? {};
    const basePoints = computePlantPoints(flags, quantity);
    return basePoints + (plant?.watering_points ?? 0);
  }, [plant]);

  const load = useCallback(async () => {
    if (!userId || !userPlantId) return;
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("user_plants")
      .select(
        "id, user_id, plant_id, quantity, planted_on, notes, photo_path, custom_name, water_days, water_time, last_watered_at, watering_points, plant:plants(common_name, scientific_name, default_co2_kg_per_year, type, plant_type:plant_types(display_name), is_native, is_endangered, is_invasive)",
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

  useEffect(() => {
    if (isEditingNotes) return;
    setNotesDraft(plant?.notes ?? "");
  }, [isEditingNotes, plant?.notes]);

  useEffect(() => {
    setWaterDaysDraft(normalizeWaterDays(plant?.water_days));
    const { timeText, meridiem } = convert24HourToDraft(plant?.water_time);
    setWaterTimeDraft(timeText);
    setTimeMeridiemDraft(meridiem);
  }, [plant?.water_days, plant?.water_time]);

  const onToggleWaterDay = (dayValue: number) => {
    setWaterDaysDraft((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((day) => day !== dayValue);
      }

      return [...prev, dayValue].sort((a, b) => a - b);
    });
    setErrorMessage("");
  };

  const onSaveWaterSchedule = async () => {
    if (!userId || !userPlantId || !plant || isSavingSchedule) return;

    const normalizedDays = normalizeWaterDays(waterDaysDraft);
    const normalizedTime = convertDraftTo24Hour(
      waterTimeDraft.trim(),
      timeMeridiemDraft,
    );

    if (!normalizedDays.length) {
      setErrorMessage("Select at least one day to water this plant.");
      return;
    }

    if (!normalizedTime || !isValidWaterTimeInput(normalizedTime)) {
      setErrorMessage("Enter a valid time (HH:MM) and choose AM or PM.");
      return;
    }

    setErrorMessage("");
    setIsSavingSchedule(true);

    const nextWaterTime = `${normalizedTime}:00`;
    const { error } = await supabase
      .from("user_plants")
      .update({ water_days: normalizedDays, water_time: nextWaterTime })
      .eq("id", userPlantId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(error.message);
      setIsSavingSchedule(false);
      return;
    }

    setPlant((prev) =>
      prev
        ? {
            ...prev,
            water_days: normalizedDays,
            water_time: nextWaterTime,
          }
        : prev,
    );
    void syncWateringRemindersForUserAsync(supabase, userId);
    setIsSavingSchedule(false);
  };

  const onClearWaterSchedule = async () => {
    if (!userId || !userPlantId || !plant || isSavingSchedule) return;

    setErrorMessage("");
    setIsSavingSchedule(true);

    const { error } = await supabase
      .from("user_plants")
      .update({ water_days: null, water_time: null })
      .eq("id", userPlantId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(error.message);
      setIsSavingSchedule(false);
      return;
    }

    setPlant((prev) =>
      prev
        ? {
            ...prev,
            water_days: null,
            water_time: null,
          }
        : prev,
    );
    setWaterDaysDraft([]);
    setWaterTimeDraft("");
    setTimeMeridiemDraft("AM");
    void syncWateringRemindersForUserAsync(supabase, userId);
    setIsSavingSchedule(false);
  };

  const onMarkWatered = async () => {
    if (!userId || !userPlantId || !plant || isSavingSchedule) return;
    const latestScheduleForMark = getLatestScheduledAt(
      plant.water_days,
      plant.water_time,
    );
    const canMarkNow =
      !!latestScheduleForMark &&
      (!plant.last_watered_at ||
        new Date(plant.last_watered_at).getTime() <
          latestScheduleForMark.getTime());
    if (!canMarkNow) {
      setErrorMessage(
        "This plant is not due for watering yet. Set a schedule and wait until it is due.",
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const nextWateringPoints =
      (plant.watering_points ?? 0) +
      (plant.quantity ?? 1) * WATERING_POINTS_PER_PLANT;

    setErrorMessage("");
    setIsSavingSchedule(true);

    const { error } = await supabase
      .from("user_plants")
      .update({
        last_watered_at: nowIso,
        watering_points: nextWateringPoints,
      })
      .eq("id", userPlantId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(error.message);
      setIsSavingSchedule(false);
      return;
    }

    setPlant((prev) =>
      prev
        ? {
            ...prev,
            last_watered_at: nowIso,
            watering_points: nextWateringPoints,
          }
        : prev,
    );
    setIsSavingSchedule(false);
  };

  const onStartEditName = () => {
    setErrorMessage("");
    setIsEditingName(true);
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

  const onStartEditNotes = () => {
    setErrorMessage("");
    setIsEditingNotes(true);
  };

  const onCancelEditNotes = () => {
    setNotesDraft(plant?.notes ?? "");
    setIsEditingNotes(false);
  };

  const onSaveNotes = async () => {
    if (!userId || !userPlantId || !plant || isSavingNotes) return;
    const trimmed = notesDraft.trim();

    setErrorMessage("");
    setIsSavingNotes(true);

    const { error } = await supabase
      .from("user_plants")
      .update({ notes: trimmed || null })
      .eq("id", userPlantId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(error.message);
      setIsSavingNotes(false);
      return;
    }

    setPlant((prev) => (prev ? { ...prev, notes: trimmed || null } : prev));
    setIsSavingNotes(false);
    setIsEditingNotes(false);
  };

  const uploadPlantPhotoAsset = useCallback(
    async (source: {
      uri: string;
      mimeType?: string | null;
      base64?: string | null;
    }) => {
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
      } catch {
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
      exif: false,
      base64: true,
    });
    if (result.canceled || !result.assets.length) return;
    const [asset] = result.assets;
    await uploadPlantPhotoAsset({
      uri: asset.uri,
      mimeType: asset.mimeType,
      base64: asset.base64,
    });
  };

  const onOpenCamera = () => setIsCameraOpen(true);
  const onCameraClose = () => setIsCameraOpen(false);
  const onCameraCapture = (
    uri: string,
    mimeType: string,
    base64?: string | null,
  ) => {
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
  const savedScheduleText =
    plant?.water_days?.length && plant?.water_time
      ? `${formatWaterDays(plant.water_days)} at ${formatWaterTime(plant.water_time)}`
      : "No watering schedule set yet.";
  const latestScheduledAt = getLatestScheduledAt(
    plant?.water_days,
    plant?.water_time,
  );
  const isWateringDue =
    !!latestScheduledAt &&
    (!plant?.last_watered_at ||
      new Date(plant.last_watered_at).getTime() < latestScheduledAt.getTime());
  const canMarkWatered = isWateringDue && !isSavingSchedule;
  const lastWateredLabel = plant?.last_watered_at
    ? new Date(plant.last_watered_at).toLocaleString()
    : "Never";

  const onPressBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(protected)/(tabs)/plants");
  };

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
        <Pressable onPress={onPressBack} style={styles.backButton}>
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
          {scientificName && (
            <Text style={styles.scientificName}>{scientificName}</Text>
          )}
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
              <Text style={styles.photoPlaceholderText}>
                Add a photo of your {displayName}
              </Text>
            </View>
          )}
          <View style={styles.photoActions}>
            <Pressable style={styles.photoActionButton} onPress={onOpenCamera}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                style={styles.actionGradient}
              >
                <Ionicons name="camera" size={24} color={COLORS.background} />
              </LinearGradient>
            </Pressable>
            <Pressable
              style={styles.photoActionButton}
              onPress={onPickAndUploadFromLibrary}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                style={styles.actionGradient}
              >
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

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={COLORS.primary}
            />
            <Text style={styles.cardTitle}>Notes</Text>
          </View>
          {isEditingNotes ? (
            <>
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Where is it? How is it doing?"
                placeholderTextColor={COLORS.secondary + "70"}
                style={styles.notesInput}
                multiline
                numberOfLines={4}
              />
              <View style={styles.notesActions}>
                <Pressable
                  onPress={onCancelEditNotes}
                  disabled={isSavingNotes}
                  style={[styles.notesButton, styles.notesButtonSecondary]}
                >
                  <Text style={styles.notesButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onSaveNotes}
                  disabled={isSavingNotes}
                  style={[
                    styles.notesButton,
                    isSavingNotes && styles.scheduleActionButtonDisabled,
                  ]}
                >
                  {isSavingNotes ? (
                    <ActivityIndicator size="small" color={COLORS.background} />
                  ) : (
                    <Text style={styles.notesButtonText}>Save Notes</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.cardContent}>
                {plant?.notes?.trim() || "No notes yet."}
              </Text>
              <Pressable
                onPress={onStartEditNotes}
                style={styles.notesEditLink}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={COLORS.secondary}
                />
                <Text style={styles.notesEditLinkText}>
                  {plant?.notes?.trim() ? "Edit notes" : "Add notes"}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="water" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Watering Schedule</Text>
          </View>
          <Text style={styles.scheduleHint}>
            Choose the days and time this plant should be watered each week.
          </Text>
          <View style={styles.weekdayRow}>
            {WEEKDAY_OPTIONS.map((day) => {
              const isSelected = waterDaysDraft.includes(day.value);
              return (
                <Pressable
                  key={day.value}
                  onPress={() => onToggleWaterDay(day.value)}
                  style={[
                    styles.weekdayChip,
                    isSelected && styles.weekdayChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.weekdayChipText,
                      isSelected && styles.weekdayChipTextSelected,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeInputRow}>
            <Text style={styles.timeInputLabel}>Watering Time</Text>
            <View style={styles.timeInputControls}>
              <TextInput
                value={waterTimeDraft}
                onChangeText={(value) => {
                  setWaterTimeDraft(formatTimeInputFromDigits(value));
                  setErrorMessage("");
                }}
                onBlur={() => {
                  setWaterTimeDraft((prev) => normalizeTimeInputOnBlur(prev));
                }}
                placeholder="08:30"
                placeholderTextColor={COLORS.secondary + "80"}
                style={styles.timeInput}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={5}
              />
              <View style={styles.meridiemToggle}>
                {MERIDIEM_OPTIONS.map((option) => {
                  const isSelected = timeMeridiemDraft === option;

                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setTimeMeridiemDraft(option);
                        setErrorMessage("");
                      }}
                      style={[
                        styles.meridiemButton,
                        isSelected && styles.meridiemButtonSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.meridiemButtonText,
                          isSelected && styles.meridiemButtonTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Text style={styles.timeInputHelper}>
              Type 4 digits. We auto-format it as HH:MM.
            </Text>
          </View>

          <View style={styles.scheduleInfo}>
            <View style={styles.infoRow}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={COLORS.secondary}
              />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Current Schedule</Text>
                <Text style={styles.infoValue}>{savedScheduleText}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="water-outline" size={18} color={COLORS.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Last Watered</Text>
                <Text style={styles.infoValue}>{lastWateredLabel}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name={isWateringDue ? "alert-circle" : "checkmark-done"}
                size={18}
                color={isWateringDue ? COLORS.warning : COLORS.primary}
              />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text
                  style={[
                    styles.infoValue,
                    isWateringDue && styles.dueText,
                    !isWateringDue && styles.upToDateText,
                  ]}
                >
                  {isWateringDue ? "Thirsty! (Due now)" : "Up to date"}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="star-outline" size={18} color={COLORS.accent} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Watering Points</Text>
                <Text style={styles.infoValue}>
                  {plant?.watering_points ?? 0} pts
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.scheduleActions}>
            <Pressable
              onPress={onSaveWaterSchedule}
              disabled={isSavingSchedule}
              style={[
                styles.scheduleActionButton,
                isSavingSchedule && styles.scheduleActionButtonDisabled,
              ]}
            >
              {isSavingSchedule ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.scheduleActionButtonText}>
                  Save Schedule
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={onMarkWatered}
              disabled={!canMarkWatered}
              style={[
                styles.scheduleActionButton,
                styles.markWateredButton,
                !canMarkWatered && styles.scheduleActionButtonDisabled,
              ]}
            >
              <Text style={styles.scheduleActionButtonText}>Mark Watered</Text>
            </Pressable>
            <Pressable
              onPress={onClearWaterSchedule}
              disabled={isSavingSchedule}
              style={[
                styles.scheduleSecondaryButton,
                isSavingSchedule && styles.scheduleActionButtonDisabled,
              ]}
            >
              <Text style={styles.scheduleSecondaryButtonText}>Clear</Text>
            </Pressable>
          </View>
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
  notesInput: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    backgroundColor: COLORS.accent + "40",
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textAlignVertical: "top",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  notesActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  notesButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  notesButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  notesButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.secondary + "50",
  },
  notesButtonSecondaryText: {
    color: COLORS.secondary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  notesEditLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  notesEditLinkText: {
    color: COLORS.secondary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  scheduleHint: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  weekdayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  weekdayChip: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    backgroundColor: COLORS.accent + "30",
    alignItems: "center",
  },
  weekdayChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  weekdayChipText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  weekdayChipTextSelected: {
    color: COLORS.background,
  },
  timeInputRow: {
    gap: 8,
  },
  timeInputControls: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  timeInputLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.75,
  },
  timeInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    backgroundColor: COLORS.accent + "35",
    paddingHorizontal: 14,
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    letterSpacing: 0.8,
    paddingVertical: 14,
  },
  meridiemToggle: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "35",
    backgroundColor: COLORS.accent + "35",
    overflow: "hidden",
  },
  meridiemButton: {
    minHeight: 50,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  meridiemButtonSelected: {
    backgroundColor: COLORS.primary,
  },
  meridiemButtonText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 15,
  },
  meridiemButtonTextSelected: {
    color: COLORS.background,
  },
  timeInputHelper: {
    color: COLORS.secondary + "80",
    fontFamily: "Boogaloo_400Regular",
    fontSize: 13,
  },
  scheduleInfo: {
    marginTop: 4,
    gap: 12,
    paddingVertical: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  infoValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  dueText: {
    color: COLORS.warning,
  },
  upToDateText: {
    color: COLORS.primary,
  },
  scheduleActions: {
    flexDirection: "row",
    gap: 10,
  },
  scheduleActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  scheduleActionButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  scheduleSecondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "45",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
  },
  scheduleSecondaryButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  scheduleActionButtonDisabled: {
    opacity: 0.6,
  },
  markWateredButton: {
    backgroundColor: COLORS.secondary,
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
