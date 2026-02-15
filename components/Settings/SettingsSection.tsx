import {
  type ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type CityOption = {
  id: string;
  name: string;
  region: string | null;
  state: string | null;
  country_code: string;
};

type SettingsStatus = {
  type: "success" | "error";
  message: string;
} | null;

type SettingsSectionProps = {
  onRequestCamera?: () => void;
  onInputFocus?: () => void;
  onProfileSaved?: (profile: {
    full_name: string;
    display_name: string;
    city_id: string | null;
  }) => void;
};

export type SettingsSectionHandle = {
  handleCameraPhoto: (photo: AvatarUploadSource) => Promise<void>;
};

type AvatarUploadSource = {
  uri: string;
  mimeType: string;
  base64?: string | null;
};

const AVATAR_BUCKET = "avatars";
const MAX_LOCATION_RESULTS = 6;

const normalizeText = (value: string) => value.trim().toLowerCase();

const formatCityLabel = (city: CityOption) => {
  const region = city.state ?? city.region;
  return region ? `${city.name}, ${region}` : city.name;
};

const getFileExtension = (uri: string, mimeType?: string | null) => {
  const mimeExtension = mimeType?.split("/")[1]?.toLowerCase();
  if (mimeExtension) {
    return mimeExtension === "jpeg" ? "jpg" : mimeExtension;
  }

  const uriParts = uri.split(".");
  const fallbackExtension = uriParts[uriParts.length - 1]?.toLowerCase();
  if (fallbackExtension && fallbackExtension.length <= 5) {
    return fallbackExtension;
  }

  return "jpg";
};

const readImageUriAsBlob = async (uri: string) => {
  try {
    const response = await fetch(uri);
    return await response.blob();
  } catch {
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onerror = () =>
        reject(new Error("Could not read image from device."));
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }
};

const decodeBase64ToBytes = (value: string) => {
  const base64 = value
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s/g, "");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;

  const byteLength = (base64.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let i = 0; i < base64.length; i += 4) {
    const c1 = alphabet.indexOf(base64[i] ?? "A");
    const c2 = alphabet.indexOf(base64[i + 1] ?? "A");
    const c3 =
      base64[i + 2] === "=" || base64[i + 2] == null
        ? 0
        : alphabet.indexOf(base64[i + 2]);
    const c4 =
      base64[i + 3] === "=" || base64[i + 3] == null
        ? 0
        : alphabet.indexOf(base64[i + 3]);

    const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;

    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 0xff;
  }

  return bytes;
};

const SettingsSectionComponent = (
  { onRequestCamera, onInputFocus, onProfileSaved }: SettingsSectionProps,
  ref: ForwardedRef<SettingsSectionHandle>,
) => {
  const { session, supabase } = useSupabase();
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [status, setStatus] = useState<SettingsStatus>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadSettings = async () => {
      setIsLoading(true);
      const [
        { data: profile, error: profileError },
        { data: citiesData, error: citiesError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, display_name, city_id, city, avatar_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("cities")
          .select("id, name, region, state, country_code")
          .order("name", { ascending: true }),
      ]);

      if (profileError || citiesError) {
        setStatus({
          type: "error",
          message: "Could not load your settings. Please try again.",
        });
        setIsLoading(false);
        return;
      }

      const nextCities = citiesData ?? [];
      setCities(nextCities);
      setFullName(profile?.full_name ?? "");
      setDisplayName(profile?.display_name ?? "");
      setSelectedCityId(profile?.city_id ?? null);
      setAvatarUrl(profile?.avatar_url ?? null);

      const selectedCity = nextCities.find(
        (city) => city.id === profile?.city_id,
      );
      if (selectedCity) {
        setLocationQuery(formatCityLabel(selectedCity));
      } else {
        setLocationQuery(profile?.city ?? "");
      }

      setStatus(null);
      setIsLoading(false);
    };

    void loadSettings();
  }, [session?.user?.id, supabase]);

  const filteredCities = useMemo(() => {
    const query = normalizeText(locationQuery);
    if (!query) {
      return cities.slice(0, MAX_LOCATION_RESULTS);
    }

    return cities
      .filter((city) => {
        const cityLabel = formatCityLabel(city).toLowerCase();
        const region = (city.state ?? city.region ?? "").toLowerCase();
        return (
          city.name.toLowerCase().includes(query) ||
          cityLabel.includes(query) ||
          region.includes(query) ||
          city.country_code.toLowerCase().includes(query)
        );
      })
      .slice(0, MAX_LOCATION_RESULTS);
  }, [cities, locationQuery]);

  const onLocationChange = (value: string) => {
    setLocationQuery(value);
    setSelectedCityId(null);
    setStatus(null);
  };

  const onSelectCity = (city: CityOption) => {
    setSelectedCityId(city.id);
    setLocationQuery(formatCityLabel(city));
    setStatus(null);
  };

  const uploadAvatarAsset = useCallback(
    async (userId: string, source: AvatarUploadSource) => {
      const { uri, mimeType, base64 } = source;
      const extension = getFileExtension(uri, mimeType);
      const path = `${userId}/avatar-${Date.now()}.${extension}`;

      try {
        setStatus(null);
        setIsUploadingAvatar(true);

        const imageBody = base64
          ? decodeBase64ToBytes(base64)
          : await readImageUriAsBlob(uri);

        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, imageBody, {
            cacheControl: "3600",
            upsert: true,
            contentType: mimeType ?? "image/jpeg",
          });

        if (uploadError) {
          const normalizedMessage = uploadError.message.toLowerCase();
          if (
            normalizedMessage.includes("bucket") &&
            normalizedMessage.includes("not found")
          ) {
            setStatus({
              type: "error",
              message:
                "Supabase bucket `avatars` is missing. Run storage migration 202602140004 and try again.",
            });
          } else {
            setStatus({ type: "error", message: uploadError.message });
          }
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(path);

        const nextAvatarUrl = publicUrlData.publicUrl;

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: nextAvatarUrl })
          .eq("id", userId);

        if (updateError) {
          setStatus({ type: "error", message: updateError.message });
          return;
        }

        setAvatarUrl(nextAvatarUrl);
        setStatus({ type: "success", message: "Profile photo updated." });
      } catch (error) {
        console.error(JSON.stringify(error, null, 2));
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        let statusMessage =
          "Could not upload your profile photo. Please try again.";
        if (message.includes("network request failed")) {
          statusMessage =
            "Could not upload the photo due to a network error. Check your connection and Supabase URL.";
        } else if (message.includes("could not read image")) {
          statusMessage =
            "Could not read the photo file on this device. Please try again or use Library.";
        }
        setStatus({
          type: "error",
          message: statusMessage,
        });
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [supabase],
  );

  const handleCameraPhoto = useCallback(
    async (photo: AvatarUploadSource) => {
      const userId = session?.user?.id;
      if (!userId) return;
      await uploadAvatarAsset(userId, photo);
    },
    [session?.user?.id, uploadAvatarAsset],
  );

  useImperativeHandle(ref, () => ({ handleCameraPhoto }), [handleCameraPhoto]);

  const pickAndUploadAvatarFromLibrary = async (userId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Photo library access is needed to upload a profile photo.",
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      exif: false,
      base64: true,
    });

    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    const [asset] = pickerResult.assets;
    await uploadAvatarAsset(userId, {
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      base64: asset.base64,
    });
  };

  const launchCameraAvatarFlow = () => {
    if (isUploadingAvatar) return;
    onRequestCamera?.();
  };

  const launchLibraryAvatarFlow = () => {
    const userId = session?.user?.id;
    if (!userId || isUploadingAvatar) return;
    void pickAndUploadAvatarFromLibrary(userId);
  };

  const saveSettings = async () => {
    const userId = session?.user?.id;
    if (!userId || isSaving) return;

    const normalizedFullName = fullName.trim();
    const normalizedDisplayName = displayName.trim();
    const normalizedLocation = locationQuery.trim();

    if (!normalizedFullName) {
      setStatus({ type: "error", message: "Name is required." });
      return;
    }

    let resolvedCityId: string | null = null;
    if (normalizedLocation) {
      if (selectedCityId) {
        resolvedCityId = selectedCityId;
      } else {
        const match = cities.find((city) => {
          const cityName = normalizeText(city.name);
          const cityLabel = normalizeText(formatCityLabel(city));
          const target = normalizeText(normalizedLocation);
          return cityName === target || cityLabel === target;
        });

        if (!match) {
          setStatus({
            type: "error",
            message: "Select a location from the suggestions.",
          });
          return;
        }

        resolvedCityId = match.id;
      }
    }

    try {
      setStatus(null);
      setIsSaving(true);

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: normalizedFullName,
          display_name: normalizedDisplayName || normalizedFullName,
          city_id: resolvedCityId,
        })
        .eq("id", userId);

      if (error) {
        setStatus({ type: "error", message: error.message });
        return;
      }

      onProfileSaved?.({
        full_name: normalizedFullName,
        display_name: normalizedDisplayName || normalizedFullName,
        city_id: resolvedCityId,
      });

      if (resolvedCityId) {
        const updatedCity = cities.find((city) => city.id === resolvedCityId);
        if (updatedCity) {
          setLocationQuery(formatCityLabel(updatedCity));
          setSelectedCityId(updatedCity.id);
        }
      }

      setStatus({ type: "success", message: "Settings saved successfully." });
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      setStatus({
        type: "error",
        message: "Could not save your settings. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Personalize your gardening profile
          </Text>
        </View>
        <Ionicons
          name="settings"
          size={28}
          color={COLORS.primary}
          opacity={0.5}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={40} color={COLORS.primary} />
                </View>
              )}
              <Pressable
                onPress={launchCameraAvatarFlow}
                disabled={isUploadingAvatar}
                style={({ pressed }) => [
                  styles.avatarEditButton,
                  pressed && styles.pressed,
                ]}
              >
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Ionicons name="camera" size={18} color={COLORS.background} />
                )}
              </Pressable>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarTitle}>Profile Picture</Text>
              <Text style={styles.avatarSubtitle}>JPG or PNG. Max 1MB.</Text>
              <View style={styles.avatarActions}>
                <Pressable
                  onPress={launchCameraAvatarFlow}
                  disabled={isUploadingAvatar}
                  style={({ pressed }) => [
                    styles.avatarActionButton,
                    pressed && styles.pressed,
                    isUploadingAvatar && styles.disabledButton,
                  ]}
                >
                  <Ionicons
                    name="camera-outline"
                    size={14}
                    color={COLORS.background}
                  />
                  <Text style={styles.avatarActionText}>Camera</Text>
                </Pressable>
                <Pressable
                  onPress={launchLibraryAvatarFlow}
                  disabled={isUploadingAvatar}
                  style={({ pressed }) => [
                    styles.avatarActionButton,
                    styles.avatarActionButtonSecondary,
                    pressed && styles.pressed,
                    isUploadingAvatar && styles.disabledButton,
                  ]}
                >
                  <Ionicons
                    name="images-outline"
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.avatarActionText,
                      styles.avatarActionTextSecondary,
                    ]}
                  >
                    Library
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={20}
                color={COLORS.secondary}
                style={styles.inputIcon}
              />
              <BottomSheetTextInput
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  setStatus(null);
                }}
                onFocus={onInputFocus}
                placeholder="Jane Doe"
                placeholderTextColor={COLORS.secondary + "80"}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="at-outline"
                size={20}
                color={COLORS.secondary}
                style={styles.inputIcon}
              />
              <BottomSheetTextInput
                value={displayName}
                onChangeText={(value) => {
                  setDisplayName(value);
                  setStatus(null);
                }}
                onFocus={onInputFocus}
                placeholder="GardenerExtraordinaire"
                placeholderTextColor={COLORS.secondary + "80"}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="location-outline"
                size={20}
                color={COLORS.secondary}
                style={styles.inputIcon}
              />
              <BottomSheetTextInput
                value={locationQuery}
                onChangeText={onLocationChange}
                onFocus={onInputFocus}
                placeholder="Search city..."
                placeholderTextColor={COLORS.secondary + "80"}
                style={styles.input}
              />
            </View>

            {locationQuery.trim().length > 0 && filteredCities.length > 0 ? (
              <View style={styles.locationSuggestions}>
                {filteredCities.map((item, index) => {
                  const isSelected = selectedCityId === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelectCity(item)}
                      style={({ pressed }) => [
                        styles.locationOption,
                        index === filteredCities.length - 1 &&
                          styles.locationOptionLast,
                        isSelected && styles.locationOptionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "map-outline"}
                        size={16}
                        color={COLORS.secondary}
                      />
                      <Text style={styles.locationOptionText}>
                        {formatCityLabel(item)}
                      </Text>
                      <Text style={styles.locationOptionCode}>
                        {item.country_code}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {status && (
            <View
              style={[
                styles.messageContainer,
                status.type === "success"
                  ? styles.messageContainerSuccess
                  : styles.messageContainerError,
              ]}
            >
              <Ionicons
                name={
                  status.type === "success"
                    ? "checkmark-circle"
                    : "alert-circle"
                }
                size={20}
                color={
                  status.type === "success" ? COLORS.primary : COLORS.warning
                }
              />
              <Text
                style={[
                  styles.messageText,
                  status.type === "success"
                    ? styles.messageTextSuccess
                    : styles.messageTextError,
                ]}
              >
                {status.message}
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.pressed,
              (isSaving || isUploadingAvatar) && styles.disabledButton,
            ]}
            onPress={saveSettings}
            disabled={isSaving || isUploadingAvatar}
          >
            {isSaving ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Text style={styles.saveButtonText}>Save Changes</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.background}
                />
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
};

export const SettingsSection = forwardRef(SettingsSectionComponent);
SettingsSection.displayName = "SettingsSection";

export { type SettingsSectionProps };

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
  },
  title: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
    marginTop: -2,
  },
  loadingContainer: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    gap: 20,
  },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarEditButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.background,
  },
  avatarInfo: {
    flex: 1,
    gap: 4,
  },
  avatarActions: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
  },
  avatarActionButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  avatarActionButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  avatarActionText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  avatarActionTextSecondary: {
    color: COLORS.primary,
  },
  avatarTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  avatarSubtitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.secondary + "15",
    marginVertical: 4,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    marginLeft: 4,
  },
  inputWrapper: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    backgroundColor: COLORS.accent + "40",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    height: "100%",
  },
  locationSuggestions: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    backgroundColor: COLORS.accent + "50",
    overflow: "hidden",
  },
  locationOption: {
    minHeight: 50,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary + "15",
  },
  locationOptionLast: {
    borderBottomWidth: 0,
  },
  locationOptionSelected: {
    backgroundColor: COLORS.primary + "12",
  },
  locationOptionText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  locationOptionCode: {
    color: COLORS.secondary,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  messageContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  messageContainerSuccess: {
    backgroundColor: COLORS.primary + "15",
    borderColor: COLORS.primary + "30",
  },
  messageContainerError: {
    backgroundColor: COLORS.warning + "10",
    borderColor: COLORS.warning + "30",
  },
  messageText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  messageTextSuccess: {
    color: COLORS.primary,
  },
  messageTextError: {
    color: COLORS.warning,
  },
  saveButton: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
