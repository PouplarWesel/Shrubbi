import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
  Image,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSignUp } from "@/hooks/useSignUp";

const { width } = Dimensions.get("window");

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
        <View style={styles.backgroundDecoration}>
          <View style={[styles.blob, styles.blob1]} />
          <View style={[styles.blob, styles.blob2]} />
        </View>

        <ScrollView
          automaticallyAdjustsScrollIndicatorInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require("@/assets/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Verify Account</Text>
            <Text style={styles.subtitle}>
              Enter the code sent to {email}
            </Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="key-outline"
                  size={20}
                  color={COLORS.secondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={COLORS.secondary + "80"}
                  keyboardType="number-pad"
                  style={styles.input}
                  value={token}
                  onChangeText={setToken}
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

            <Pressable
              disabled={verifyDisabled}
              onPress={onVerifyPress}
              style={({ pressed }) => [
                styles.primaryButton,
                verifyDisabled && styles.disabledButton,
                pressed && !verifyDisabled && styles.pressedButton,
              ]}
            >
              {isVerifying ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Verify</Text>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.background}
                  />
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => setPendingVerification(false)}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>Use a different email</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundDecoration}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
      </View>

      <ScrollView
        automaticallyAdjustsScrollIndicatorInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require("@/assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Start your Shrubbi journey in seconds
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={COLORS.secondary}
                style={styles.inputIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={COLORS.secondary + "80"}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={COLORS.secondary}
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Create a password"
                placeholderTextColor={COLORS.secondary + "80"}
                secureTextEntry={!showPassword}
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.toggleButton}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.secondary}
                />
              </Pressable>
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

          <Pressable
            disabled={signUpDisabled}
            onPress={onSignUpPress}
            style={({ pressed }) => [
              styles.primaryButton,
              signUpDisabled && styles.disabledButton,
              pressed && !signUpDisabled && styles.pressedButton,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Continue</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={COLORS.background}
                />
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.linkHint}>Already have an account? </Text>
          <Pressable onPress={() => router.replace("/sign-in")}>
            <Text style={styles.linkText}>Sign in</Text>
          </Pressable>
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
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
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
    lineHeight: 44,
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
    gap: 20,
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
  },
  passwordInput: {
    paddingRight: 8,
  },
  toggleButton: {
    padding: 4,
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
    marginTop: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pressedButton: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  backButton: {
    alignItems: "center",
    padding: 12,
  },
  backButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 40,
    paddingBottom: 20,
  },
  linkHint: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textDecorationLine: "underline",
  },
});
