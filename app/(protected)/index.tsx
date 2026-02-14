import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { router } from "expo-router";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

export default function ProtectedIndexPage() {
  const { session, isLoaded, supabase } = useSupabase();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!isLoaded) return;

      const userId = session?.user?.id;
      if (!userId) {
        setIsChecking(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name, city_id")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        router.replace("/(protected)/onboarding");
        setIsChecking(false);
        return;
      }

      const hasName = !!profile?.full_name?.trim();
      const hasCity = !!profile?.city_id;
      const isOnboarded = hasName && hasCity;

      router.replace(
        isOnboarded ? "/(protected)/(tabs)" : "/(protected)/onboarding",
      );
      setIsChecking(false);
    };

    run();
  }, [isLoaded, session?.user?.id, supabase]);

  if (!isChecking) return null;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
});
