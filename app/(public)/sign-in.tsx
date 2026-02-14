import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useSignIn } from "@/hooks/useSignIn";

const getErrorMessage = (err: unknown, fallback: string) => {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return err.message;
  }
  return fallback;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export default function Page() {
  const { signInWithPassword, resetPasswordForEmail, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSignInPress = async () => {
    if (!isLoaded || isSubmitting) return;
    if (!isValidEmail(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSubmitting(true);
      await signInWithPassword({
        email,
        password,
      });
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Could not sign in. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onForgotPasswordPress = async () => {
    if (!isLoaded) return;
    if (!isValidEmail(email)) {
      Alert.alert("Email required", "Enter a valid email to reset password.");
      return;
    }

    try {
      setErrorMessage("");
      await resetPasswordForEmail(email);
      setResetMessage("Password reset link sent. Check your email.");
    } catch (err) {
      setErrorMessage(
        getErrorMessage(err, "Could not send reset link. Please try again."),
      );
      setResetMessage("Could not send reset link. Please try again.");
    }
  };

  const isDisabled = !email || !password || !isLoaded || isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustsScrollIndicatorInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          Sign in to continue growing with Shrubbi
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
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="Enter password"
              placeholderTextColor={COLORS.secondary}
              secureTextEntry={!showPassword}
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleButtonText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onForgotPasswordPress}
            style={styles.forgotPassword}
          >
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </Pressable>

          {!!resetMessage && (
            <Text style={styles.resetMessage}>{resetMessage}</Text>
          )}
          {!!errorMessage && (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          )}

          <Pressable
            disabled={isDisabled}
            onPress={onSignInPress}
            style={[styles.primaryButton, isDisabled && styles.disabledButton]}
          >
            {isSubmitting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.background} />
                <Text style={styles.primaryButtonText}>Signing In...</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.linkRow}>
          <Text style={styles.linkHint}>Don&apos;t have an account? </Text>
          <Text
            style={styles.linkText}
            onPress={() => router.replace("/sign-up")}
          >
            Sign up
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
  passwordRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
  },
  toggleButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  forgotPassword: {
    alignSelf: "flex-end",
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    textDecorationLine: "underline",
  },
  resetMessage: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  errorMessage: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
