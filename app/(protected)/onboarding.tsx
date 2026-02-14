import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type CityOption = {
  id: string;
  name: string;
  region: string | null;
  country_code: string;
};

export default function OnboardingPage() {
  const { session, supabase } = useSupabase();
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
    if (!query) return cities;
    return cities.filter((city) => {
      const cityName = city.name.toLowerCase();
      const region = (city.region ?? "").toLowerCase();
      return cityName.includes(query) || region.includes(query);
    });
  }, [cities, citySearch]);

  const onContinue = async () => {
    const userId = session?.user?.id;
    const email = session?.user?.email ?? "";
    if (!userId || isSaving) return;

    const normalizedFullName = fullName.trim();
    const normalizedDisplayName = displayName.trim();

    if (!normalizedFullName) {
      setErrorMessage("Full name is required.");
      return;
    }

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
          full_name: normalizedFullName,
          display_name: normalizedDisplayName || normalizedFullName,
          city_id: selectedCityId,
        })
        .eq("id", userId);

      if (error) {
        setErrorMessage("Could not save your profile. Please try again.");
        return;
      }

      router.replace("/(protected)/(tabs)");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Finish Your Profile</Text>
          <Text style={styles.subtitle}>
            Tell us a bit about you so your experience is personalized.
          </Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={COLORS.secondary}
            style={styles.input}
          />

          <Text style={styles.label}>Display Name (Optional)</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How others see you"
            placeholderTextColor={COLORS.secondary}
            style={styles.input}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            value={citySearch}
            onChangeText={setCitySearch}
            placeholder="Search city"
            placeholderTextColor={COLORS.secondary}
            style={styles.input}
          />

          <View style={styles.cityList}>
            <ScrollView nestedScrollEnabled style={styles.cityListScroll}>
              {filteredCities.map((city) => {
                const isSelected = selectedCityId === city.id;
                return (
                  <Pressable
                    key={city.id}
                    onPress={() => setSelectedCityId(city.id)}
                    style={[
                      styles.cityItem,
                      isSelected && styles.cityItemSelected,
                    ]}
                  >
                    <Text style={styles.cityName}>
                      {city.name}
                      {city.region ? `, ${city.region}` : ""}
                    </Text>
                    <Text style={styles.cityCountry}>{city.country_code}</Text>
                  </Pressable>
                );
              })}
              {filteredCities.length === 0 && (
                <Text style={styles.emptyText}>No matching cities.</Text>
              )}
            </ScrollView>
          </View>

          {!!errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}

          <Pressable
            onPress={onContinue}
            disabled={isSaving}
            style={[styles.button, isSaving && styles.buttonDisabled]}
          >
            {isSaving ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.background} />
                <Text style={styles.buttonText}>Saving...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.secondary,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  title: {
    color: COLORS.primary,
    fontSize: 36,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 6,
  },
  label: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  cityList: {
    borderWidth: 1,
    borderColor: COLORS.secondary,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    maxHeight: 220,
  },
  cityListScroll: {
    paddingVertical: 4,
  },
  cityItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cityItemSelected: {
    backgroundColor: COLORS.accent,
  },
  cityName: {
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  cityCountry: {
    color: COLORS.secondary,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  emptyText: {
    color: COLORS.secondary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    padding: 12,
  },
  errorText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    marginTop: 6,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
