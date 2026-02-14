import { Pressable, StyleSheet, Text, View } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  text: "#abd8bd",
  background: "#000f0d",
  primary: "#bff4fd",
  secondary: "#a9d0c6",
  accent: "#072900",
};

export default function Page() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Grow your space with Shrubbi</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push("/sign-up")}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push("/sign-up")}
        >
          <Text style={styles.secondaryButtonText}>Sign Up</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.accentButton]}
          onPress={() => router.push("/sign-in")}
        >
          <Text style={styles.accentButtonText}>Sign In</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  content: {
    paddingTop: 72,
    gap: 10,
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
  },
  actions: {
    gap: 12,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  secondaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "600",
  },
  accentButton: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.text,
  },
  accentButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
