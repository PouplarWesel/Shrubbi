import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";

export default function Page() {
  const { width: windowWidth } = useWindowDimensions();
  const blobBase =
    Platform.OS === "web" ? Math.min(windowWidth, 420) : windowWidth;

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS !== "web" ? (
        <View style={styles.backgroundDecoration}>
          <View
            style={[
              styles.blob,
              styles.blob1,
              {
                width: blobBase * 1.2,
                height: blobBase * 1.2,
                borderRadius: blobBase,
                top: -blobBase * 0.4,
                right: -blobBase * 0.4,
              },
            ]}
          />
          <View
            style={[
              styles.blob,
              styles.blob2,
              {
                width: blobBase,
                height: blobBase,
                borderRadius: blobBase,
                bottom: -blobBase * 0.2,
                left: -blobBase * 0.3,
              },
            ]}
          />
          <View
            style={[
              styles.blob,
              styles.blob3,
              {
                width: blobBase * 0.6,
                height: blobBase * 0.6,
                borderRadius: blobBase,
                top: blobBase * 0.3,
                left: -blobBase * 0.2,
              },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require("@/assets/icon_nobg.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>SHRUBBI</Text>
        <Text style={styles.subtitle}>Grow your space with Shrubbi</Text>
        <Text style={styles.description}>
          Your personal companion for a greener, more sustainable lifestyle.
          Start your journey today.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push("/sign-up")}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color={COLORS.background} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push("/sign-in")}
        >
          <Text style={styles.secondaryButtonText}>
            I already have an account
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  backgroundDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: -1,
  },
  blob: {
    position: "absolute",
    opacity: 0.2,
  },
  blob1: {
    backgroundColor: COLORS.accent,
  },
  blob2: {
    backgroundColor: COLORS.primary,
    opacity: 0.1,
  },
  blob3: {
    backgroundColor: COLORS.secondary,
    opacity: 0.05,
  },
  content: {
    paddingTop: 80,
    alignItems: "center",
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  logo: {
    width: 90,
    height: 90,
  },
  title: {
    color: COLORS.primary,
    fontSize: 52,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
  },
  subtitle: {
    color: COLORS.secondary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  description: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    marginTop: 20,
    lineHeight: 24,
    opacity: 0.7,
    paddingHorizontal: 20,
  },
  actions: {
    gap: 16,
  },
  button: {
    minHeight: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
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
    borderColor: COLORS.secondary + "40",
  },
  secondaryButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
});
