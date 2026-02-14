import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

const { width } = Dimensions.get("window");

type CityOption = {
  id: string;
  name: string;
  region: string | null;
  country_code: string;
};

type TeamOption = {
  id: string;
  name: string;
  description: string | null;
  city_id: string;
};

type PermissionState = "undetermined" | "granted" | "denied" | "unavailable";

const normalizeValue = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const normalizePermissionState = (
  status: string | null | undefined,
): PermissionState => {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  if (status === "undetermined") return "undetermined";
  return "unavailable";
};

const getCameraPermissionState = async (): Promise<PermissionState> => {
  try {
    const Camera = await import("expo-camera");
    const cameraResult = await Camera.Camera.getCameraPermissionsAsync();
    return normalizePermissionState(cameraResult.status);
  } catch {
    return "unavailable";
  }
};

const requestCameraPermissionState = async (): Promise<PermissionState> => {
  try {
    const Camera = await import("expo-camera");
    const cameraResult = await Camera.Camera.requestCameraPermissionsAsync();
    return normalizePermissionState(cameraResult.status);
  } catch {
    return "unavailable";
  }
};

export default function OnboardingPage() {
  const { session, supabase } = useSupabase();
  const [step, setStep] = useState(0); // 0: Profile, 1: Permissions, 2: City, 3: Group
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [joinedTeamIds, setJoinedTeamIds] = useState<string[]>([]);
  const [locationPermission, setLocationPermission] =
    useState<PermissionState>("undetermined");
  const [cameraPermission, setCameraPermission] =
    useState<PermissionState>("undetermined");
  const [notificationPermission, setNotificationPermission] =
    useState<PermissionState>("undetermined");
  const [isDetectingCity, setIsDetectingCity] = useState(false);
  const [locationHintMessage, setLocationHintMessage] = useState("");
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);
  const [detectedStateName, setDetectedStateName] = useState<string | null>(
    null,
  );
  const [detectedCountryCode, setDetectedCountryCode] = useState<string | null>(
    null,
  );
  const [hasTriedAutoCity, setHasTriedAutoCity] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const loadPermissionStatuses = async () => {
      try {
        const locationResult = await Location.getForegroundPermissionsAsync();
        setLocationPermission(normalizePermissionState(locationResult.status));
      } catch {
        setLocationPermission("unavailable");
      }

      setCameraPermission(await getCameraPermissionState());

      try {
        const notificationResult = await Notifications.getPermissionsAsync();
        setNotificationPermission(
          normalizePermissionState(notificationResult.status),
        );
      } catch {
        setNotificationPermission("unavailable");
      }
    };

    void loadPermissionStatuses();
  }, []);

  useEffect(() => {
    const load = async () => {
      const userId = session?.user?.id;
      if (!userId) {
        setIsLoading(false);
        return;
      }

      const [
        { data: profile, error: profileError },
        { data: citiesData, error: citiesError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, display_name, city_id")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("cities")
          .select("id, name, region, country_code")
          .order("name", { ascending: true }),
      ]);

      if (profileError || citiesError) {
        setErrorMessage("Could not load onboarding data. Please try again.");
        setIsLoading(false);
        return;
      }

      setFullName(profile?.full_name ?? "");
      setDisplayName(profile?.display_name ?? "");
      setSelectedCityId(profile?.city_id ?? null);
      setCities(citiesData ?? []);
      setIsLoading(false);
    };

    load();
  }, [session?.user?.id, supabase]);

  const filteredCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();
    const rankingScore = (city: CityOption) => {
      let score = 0;

      if (
        detectedCityName &&
        normalizeValue(city.name) === normalizeValue(detectedCityName)
      ) {
        score += 5;
      }

      if (
        detectedStateName &&
        normalizeValue(city.region) === normalizeValue(detectedStateName)
      ) {
        score += 2;
      }

      if (
        detectedCountryCode &&
        normalizeValue(city.country_code) ===
          normalizeValue(detectedCountryCode)
      ) {
        score += 1;
      }

      return score;
    };

    const sortedCities = [...cities].sort((a, b) => {
      const scoreDiff = rankingScore(b) - rankingScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name);
    });

    if (!query) return sortedCities;

    return sortedCities.filter((city) => {
      const cityName = city.name.toLowerCase();
      const region = (city.region ?? "").toLowerCase();
      const state = (city.state ?? "").toLowerCase();
      return (
        cityName.includes(query) ||
        region.includes(query) ||
        state.includes(query)
      );
    });
  }, [
    cities,
    citySearch,
    detectedCityName,
    detectedStateName,
    detectedCountryCode,
  ]);

  const onNextStep = () => {
    if (!fullName.trim()) {
      setErrorMessage("Full name is required.");
      return;
    }
    setErrorMessage("");
    setStep(1);
  };

  const onContinueFromPermissions = () => {
    setErrorMessage("");
    setStep(2);
  };

  const requestLocationPermission = async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      const normalizedState = normalizePermissionState(result.status);
      setLocationPermission(normalizedState);
    } catch {
      setLocationPermission("unavailable");
    }
  };

  const requestCameraPermission = async () => {
    setCameraPermission(await requestCameraPermissionState());
  };

  const requestNotificationPermission = async () => {
    try {
      const result = await Notifications.requestPermissionsAsync();
      setNotificationPermission(normalizePermissionState(result.status));
    } catch {
      setNotificationPermission("unavailable");
    }
  };

  const autoSelectCityFromLocation = useCallback(async () => {
    if (
      locationPermission !== "granted" ||
      cities.length === 0 ||
      isDetectingCity
    ) {
      return;
    }

    setHasTriedAutoCity(true);
    setIsDetectingCity(true);
    setLocationHintMessage("");

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      if (!place) {
        setLocationHintMessage(
          "Could not detect your city. You can still search and choose manually.",
        );
        return;
      }

      const detectedCity = place.city ?? place.subregion ?? "";
      const detectedState = place.region ?? "";
      const detectedCountry = place.isoCountryCode ?? "";

      setDetectedCityName(detectedCity || null);
      setDetectedStateName(detectedState || null);
      setDetectedCountryCode(detectedCountry || null);

      const matchingCity =
        cities.find(
          (city) =>
            normalizeValue(city.name) === normalizeValue(detectedCity) &&
            normalizeValue(city.region) === normalizeValue(detectedState),
        ) ??
        cities.find(
          (city) => normalizeValue(city.name) === normalizeValue(detectedCity),
        );

      if (matchingCity) {
        setSelectedCityId(matchingCity.id);
        setLocationHintMessage(
          `Detected ${matchingCity.name}${matchingCity.region ? `, ${matchingCity.region}` : ""}.`,
        );
        return;
      }

      if (detectedCity && !citySearch.trim()) {
        setCitySearch(detectedCity);
      }
      setLocationHintMessage(
        "We found your area. Pick the closest city from the list or search manually.",
      );
    } catch {
      setLocationHintMessage(
        "We could not access your current location. Search and pick your city manually.",
      );
    } finally {
      setIsDetectingCity(false);
    }
  }, [locationPermission, cities, isDetectingCity, citySearch]);

  useEffect(() => {
    if (step !== 2 || locationPermission !== "granted" || hasTriedAutoCity)
      return;
    void autoSelectCityFromLocation();
  }, [step, locationPermission, hasTriedAutoCity, autoSelectCityFromLocation]);

  const onContinue = async () => {
    const userId = session?.user?.id;
    const email = session?.user?.email ?? "";
    if (!userId || isSaving) return;

    if (!selectedCityId) {
      setErrorMessage("Please choose your city.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          email,
          full_name: fullName.trim(),
          display_name: displayName.trim() || fullName.trim(),
          city_id: selectedCityId,
        })
        .eq("id", userId);

      if (error) {
        setErrorMessage("Could not save your profile. Please try again.");
        return;
      }

      const [{ data: teamsData }, { data: membershipsData }] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id, name, description, city_id")
            .eq("city_id", selectedCityId)
            .order("name", { ascending: true }),
          supabase
            .from("team_memberships")
            .select("team_id")
            .eq("user_id", userId),
        ]);

      const normalizedTeams = (teamsData ?? []) as TeamOption[];
      setTeams(normalizedTeams);
      setJoinedTeamIds((membershipsData ?? []).map((m) => m.team_id));
      setSelectedTeamId((current) => {
        if (current) return current;
        if (normalizedTeams.length === 0) return null;
        return normalizedTeams[0].id;
      });
      setStep(3);
    } finally {
      setIsSaving(false);
    }
  };

  const onFinishOnboarding = async () => {
    const userId = session?.user?.id;
    if (!userId || isJoiningGroup) return;

    try {
      setErrorMessage("");
      setIsJoiningGroup(true);

      if (selectedTeamId && !joinedTeamIds.includes(selectedTeamId)) {
        const { error } = await supabase.from("team_memberships").insert({
          user_id: userId,
          team_id: selectedTeamId,
        });
        if (error) {
          setErrorMessage("Could not join team. You can join later in Social.");
          return;
        }
      }

      router.replace("/(protected)/(tabs)");
    } finally {
      setIsJoiningGroup(false);
    }
  };

  const headerTitle =
    step === 0
      ? "About You"
      : step === 1
        ? "Permissions"
        : step === 2
          ? "Your Location"
          : "Join a Group";

  const headerSubtitle =
    step === 0
      ? "Help us personalize your experience"
      : step === 1
        ? "Allow what you want. Everything here is optional."
        : step === 2
          ? "We'll suggest nearby cities, then you can adjust."
          : "Join a local group now, or skip and do it later in Social.";

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundDecoration}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.content}>
          <View
            style={[
              styles.header,
              isKeyboardVisible && step === 2 && styles.headerCompact,
            ]}
          >
            {!isKeyboardVisible && (
              <View style={styles.logoContainer}>
                <Image
                  source={require("@/assets/icon_nobg.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
            )}
            <Text
              style={[
                styles.title,
                isKeyboardVisible && step === 2 && styles.titleCompact,
              ]}
            >
              {headerTitle}
            </Text>
            {!isKeyboardVisible && (
              <Text style={styles.subtitle}>{headerSubtitle}</Text>
            )}
          </View>

          {step === 0 ? (
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={COLORS.secondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="Jane Doe"
                    placeholderTextColor={COLORS.secondary + "80"}
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display Name (Optional)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="at-outline"
                    size={20}
                    color={COLORS.secondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="How others see you"
                    placeholderTextColor={COLORS.secondary + "80"}
                    style={styles.input}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                </View>
              </View>

              {!!errorMessage && (
                <View style={styles.messageContainer}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={COLORS.secondary}
                  />
                  <Text style={styles.errorMessage}>{errorMessage}</Text>
                </View>
              )}

              <Pressable onPress={onNextStep} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Next</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={COLORS.background}
                />
              </Pressable>
            </View>
          ) : step === 1 ? (
            <View style={styles.formContainer}>
              <View style={styles.permissionsList}>
                <View style={styles.permissionItem}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons
                      name="locate-outline"
                      size={24}
                      color={
                        locationPermission === "granted"
                          ? COLORS.primary
                          : COLORS.secondary
                      }
                    />
                  </View>
                  <View style={styles.permissionTextContent}>
                    <Text style={styles.permissionItemTitle}>Location</Text>
                    <Text style={styles.permissionItemDescription}>
                      Suggests your current city first.
                    </Text>
                  </View>
                  <Pressable
                    onPress={requestLocationPermission}
                    disabled={locationPermission === "granted"}
                    style={[
                      styles.permissionAction,
                      locationPermission === "granted" &&
                        styles.permissionActionGranted,
                    ]}
                  >
                    {locationPermission === "granted" ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={COLORS.primary}
                      />
                    ) : (
                      <Text style={styles.permissionActionText}>Allow</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.permissionItem}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons
                      name="camera-outline"
                      size={24}
                      color={
                        cameraPermission === "granted"
                          ? COLORS.primary
                          : COLORS.secondary
                      }
                    />
                  </View>
                  <View style={styles.permissionTextContent}>
                    <Text style={styles.permissionItemTitle}>Camera</Text>
                    <Text style={styles.permissionItemDescription}>
                      Upload plant photos instantly.
                    </Text>
                  </View>
                  <Pressable
                    onPress={requestCameraPermission}
                    disabled={cameraPermission === "granted"}
                    style={[
                      styles.permissionAction,
                      cameraPermission === "granted" &&
                        styles.permissionActionGranted,
                    ]}
                  >
                    {cameraPermission === "granted" ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={COLORS.primary}
                      />
                    ) : (
                      <Text style={styles.permissionActionText}>Allow</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.permissionItem}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons
                      name="notifications-outline"
                      size={24}
                      color={
                        notificationPermission === "granted"
                          ? COLORS.primary
                          : COLORS.secondary
                      }
                    />
                  </View>
                  <View style={styles.permissionTextContent}>
                    <Text style={styles.permissionItemTitle}>
                      Notifications
                    </Text>
                    <Text style={styles.permissionItemDescription}>
                      Stay updated with your garden.
                    </Text>
                  </View>
                  <Pressable
                    onPress={requestNotificationPermission}
                    disabled={notificationPermission === "granted"}
                    style={[
                      styles.permissionAction,
                      notificationPermission === "granted" &&
                        styles.permissionActionGranted,
                    ]}
                  >
                    {notificationPermission === "granted" ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={COLORS.primary}
                      />
                    ) : (
                      <Text style={styles.permissionActionText}>Allow</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.footerButtons}>
                <Pressable
                  onPress={() => setStep(0)}
                  style={[styles.primaryButton, styles.secondaryButton]}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={onContinueFromPermissions}
                  style={[styles.primaryButton, styles.flex]}
                >
                  <Text style={styles.primaryButtonText}>Continue</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={COLORS.background}
                  />
                </Pressable>
              </View>
            </View>
          ) : step === 2 ? (
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="search-outline"
                    size={20}
                    color={COLORS.secondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="Search your city..."
                    placeholderTextColor={COLORS.secondary + "80"}
                    style={styles.input}
                    value={citySearch}
                    onChangeText={setCitySearch}
                  />
                </View>
              </View>

              {!!locationHintMessage && (
                <View style={styles.messageContainer}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={COLORS.secondary}
                  />
                  <Text style={styles.errorMessage}>{locationHintMessage}</Text>
                </View>
              )}

              <FlatList
                data={filteredCities}
                keyExtractor={(item) => item.id}
                style={styles.cityList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = selectedCityId === item.id;
                  return (
                    <Pressable
                      onPress={() => setSelectedCityId(item.id)}
                      style={[
                        styles.cityItem,
                        isSelected && styles.cityItemSelected,
                      ]}
                    >
                      <View style={styles.cityInfo}>
                        <Text style={styles.cityName}>
                          {item.name}
                          {item.region ? `, ${item.region}` : ""}
                        </Text>
                        <Text style={styles.cityCountry}>
                          {item.country_code}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={COLORS.primary}
                        />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No cities found.</Text>
                  </View>
                }
              />

              {!!errorMessage && (
                <View style={styles.messageContainer}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={COLORS.secondary}
                  />
                  <Text style={styles.errorMessage}>{errorMessage}</Text>
                </View>
              )}

              {!isKeyboardVisible && (
                <View style={styles.footerButtons}>
                  <Pressable
                    onPress={() => setStep(1)}
                    style={[styles.primaryButton, styles.secondaryButton]}
                  >
                    <Text style={styles.secondaryButtonText}>Back</Text>
                  </Pressable>
                  <Pressable
                    disabled={isSaving || !selectedCityId}
                    onPress={onContinue}
                    style={[
                      styles.primaryButton,
                      styles.flex,
                      (isSaving || !selectedCityId) && styles.disabledButton,
                    ]}
                  >
                    {isSaving ? (
                      <ActivityIndicator color={COLORS.background} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>Next</Text>
                        <Ionicons
                          name="arrow-forward"
                          size={20}
                          color={COLORS.background}
                        />
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.formContainer}>
              <View style={styles.permissionsList}>
                <Text style={styles.permissionItemTitle}>Join a Group</Text>
                <Text style={styles.permissionItemDescription}>
                  Pick a local team to connect with people in your city.
                </Text>

                {teams.length === 0 ? (
                  <Text style={styles.permissionItemDescription}>
                    No teams found in your city yet. You can create or join
                    later in Social.
                  </Text>
                ) : (
                  teams.map((team) => {
                    const isSelected = selectedTeamId === team.id;
                    const isJoined = joinedTeamIds.includes(team.id);
                    return (
                      <Pressable
                        key={team.id}
                        onPress={() => setSelectedTeamId(team.id)}
                        style={[
                          styles.cityItem,
                          isSelected && styles.cityItemSelected,
                        ]}
                      >
                        <View style={styles.cityInfo}>
                          <Text style={styles.cityName}>{team.name}</Text>
                          {!!team.description && (
                            <Text style={styles.cityCountry}>
                              {team.description}
                            </Text>
                          )}
                        </View>
                        {isJoined ? (
                          <Text style={styles.cityCountry}>Joined</Text>
                        ) : isSelected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={COLORS.primary}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </View>

              {!!errorMessage && (
                <View style={styles.messageContainer}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={COLORS.secondary}
                  />
                  <Text style={styles.errorMessage}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.footerButtons}>
                <Pressable
                  onPress={() => setStep(2)}
                  style={[styles.primaryButton, styles.secondaryButton]}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  disabled={isJoiningGroup}
                  onPress={onFinishOnboarding}
                  style={[
                    styles.primaryButton,
                    styles.flex,
                    isJoiningGroup && styles.disabledButton,
                  ]}
                >
                  {isJoiningGroup ? (
                    <ActivityIndicator color={COLORS.background} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Finish</Text>
                      <Ionicons
                        name="checkmark-done"
                        size={20}
                        color={COLORS.background}
                      />
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  backgroundDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: -1,
  },
  blob: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    opacity: 0.15,
  },
  blob1: {
    backgroundColor: COLORS.primary,
    top: -width * 0.2,
    right: -width * 0.2,
  },
  blob2: {
    backgroundColor: COLORS.accent,
    bottom: -width * 0.1,
    left: -width * 0.3,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  headerCompact: {
    marginBottom: 10,
    marginTop: 0,
    alignItems: "flex-start",
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    overflow: "hidden",
  },
  logo: {
    width: 60,
    height: 60,
  },
  title: {
    color: COLORS.primary,
    fontSize: 38,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 24,
    textAlign: "left",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    marginTop: 8,
    opacity: 0.8,
  },
  formContainer: {
    flex: 1,
    gap: 20,
  },
  permissionsList: {
    gap: 16,
    backgroundColor: COLORS.accent + "20",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary + "10",
  },
  permissionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  permissionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent + "40",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  permissionTextContent: {
    flex: 1,
    gap: 2,
  },
  permissionItemTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  permissionItemDescription: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  permissionAction: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionActionGranted: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  permissionActionText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "40",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 16,
    height: "100%",
    fontFamily: "Boogaloo_400Regular",
  },
  cityList: {
    flex: 1,
    backgroundColor: COLORS.accent + "20",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.secondary + "10",
  },
  cityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.secondary + "10",
  },
  cityItemSelected: {
    backgroundColor: COLORS.accent + "60",
  },
  cityInfo: {
    flex: 1,
  },
  cityName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  cityCountry: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 2,
  },
  messageContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.accent + "60",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  errorMessage: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowOpacity: 0,
    elevation: 0,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  footerButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
    paddingBottom: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
});
