import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignUp } from "@/hooks/useSignUp";

const COLORS = {
  text: "#abd8bd",
  background: "#000f0d",
  primary: "#bff4fd",
  secondary: "#a9d0c6",
  accent: "#072900",
};

export default function Page() {
  const { isLoaded, signUp, verifyOtp } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [token, setToken] = useState("");

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    try {
      await signUp({
        email,
        password,
      });
      setPendingVerification(true);
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;

    try {
      await verifyOtp({
        email,
        token,
      });
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const signUpDisabled = !email || !password || !isLoaded;
  const verifyDisabled = !token || !isLoaded;

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          automaticallyAdjustsScrollIndicatorInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.title}>Verify Account</Text>
          <Text style={styles.subtitle}>
            Enter the code sent to your email.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              placeholder="Enter your verification code"
              placeholderTextColor={COLORS.secondary}
              style={styles.input}
              value={token}
              onChangeText={setToken}
            />
            <Pressable
              disabled={verifyDisabled}
              onPress={onVerifyPress}
              style={[
                styles.primaryButton,
                verifyDisabled && styles.disabledButton,
              ]}
            >
              <Text style={styles.primaryButtonText}>Verify</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustsScrollIndicatorInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Start your Shrubbi journey in seconds.
        </Text>

        <View style={styles.formCard}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={COLORS.secondary}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            placeholder="Create a password"
            placeholderTextColor={COLORS.secondary}
            secureTextEntry={true}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            disabled={signUpDisabled}
            onPress={onSignUpPress}
            style={[
              styles.primaryButton,
              signUpDisabled && styles.disabledButton,
            ]}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>

        <View style={styles.linkRow}>
          <Text style={styles.linkHint}>Already have an account? </Text>
          <Text
            style={styles.linkText}
            onPress={() => router.replace("/sign-in")}
          >
            Sign in
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    gap: 14,
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 8,
  },
  formCard: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.secondary,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
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
    paddingHorizontal: 12,
    minHeight: 46,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.5,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 4,
  },
  linkHint: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    textDecorationLine: "underline",
  },
});
