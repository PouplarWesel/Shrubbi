import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, Dimensions, Image } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

const { width } = Dimensions.get("window");

export default function Page() {
  const { signOut, session, supabase } = useSupabase();
  const insets = useSafeAreaInsets();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and profile data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: handleDeleteAccount,
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase.rpc("delete_my_account");

      if (error) {
        Alert.alert("Delete failed", error.message);
        return;
      }

      await signOut();
    } catch (err) {
      Alert.alert("Delete failed", "Please try again.");
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setIsDeleting(false);
    }
  };

  const userEmail = session?.user?.email || "Gardener";
  const userName = userEmail.split("@")[0];

  return (
    <View style={styles.container}>
      <View style={styles.backgroundDecoration}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
      </View>

      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <View style={styles.avatar}>
            <Image
              source={require("@/assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="leaf-outline" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Plants</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="water-outline" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>To Water</Text>
          </View>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.cardTitle}>Daily Tip</Text>
          <Text style={styles.cardText}>
            Succulents love bright, indirect sunlight. Make sure yours are getting enough light today!
          </Text>
          <Pressable style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Learn More</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.onboardingButton,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push("/(protected)/onboarding")}
          >
            <Ionicons name="school-outline" size={20} color={COLORS.primary} />
            <Text style={styles.onboardingText}>Onboarding</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.pressed,
            ]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.secondary} />
            <Text style={styles.signOutText}>Logout</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.pressed,
              isDeleting && styles.disabledButton,
            ]}
            onPress={confirmDeleteAccount}
            disabled={isDeleting}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.warning} />
            <Text style={styles.deleteText}>
              {isDeleting ? "Deleting..." : "Delete Account"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    opacity: 0.1,
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
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  greeting: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  userName: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
    textTransform: "capitalize",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    overflow: "hidden",
  },
  logo: {
    width: 35,
    height: 35,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.accent + "40",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  statValue: {
    color: COLORS.primary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 8,
  },
  statLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  mainCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 12,
  },
  cardText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 22,
    opacity: 0.9,
    marginBottom: 20,
  },
  cardButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },
  cardButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  footer: {
    marginTop: "auto",
    paddingBottom: 40,
    alignItems: "center",
    gap: 10,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  onboardingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.accent + "55",
  },
  onboardingText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  signOutText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + "55",
    backgroundColor: COLORS.warning + "22",
  },
  deleteText: {
    color: COLORS.warning,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});
