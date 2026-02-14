import { useState } from "react";
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
import { useSignUp } from "@/hooks/useSignUp";

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
  const { isLoaded, signUp, verifyOtp } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [token, setToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded || isSubmitting) return;
    if (!isValidEmail(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (password.trim().length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSubmitting(true);
      await signUp({
        email,
        password,
      });
      setPendingVerification(true);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Could not create account."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded || isVerifying) return;
    if (!token.trim()) {
      setErrorMessage("Enter the verification code.");
      return;
    }

    try {
      setErrorMessage("");
      setIsVerifying(true);
      await verifyOtp({
        email,
        token,
      });
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Could not verify code."));
    } finally {
      setIsVerifying(false);
    }
  };

  const signUpDisabled = !email || !password || !isLoaded || isSubmitting;
  const verifyDisabled = !token || !isLoaded || isVerifying;

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
              {isVerifying ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={COLORS.background} />
                  <Text style={styles.primaryButtonText}>Verifying...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Verify</Text>
              )}
            </Pressable>
            {!!errorMessage && (
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            )}
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
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="Create a password"
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
            disabled={signUpDisabled}
            onPress={onSignUpPress}
            style={[
              styles.primaryButton,
              signUpDisabled && styles.disabledButton,
            ]}
          >
            {isSubmitting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.background} />
                <Text style={styles.primaryButtonText}>Creating...</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
          {!!errorMessage && (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          )}
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
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorMessage: {
    color: COLORS.secondary,
    fontSize: 14,
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
