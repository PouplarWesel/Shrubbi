import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useSignIn } from "@/hooks/useSignIn";

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

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail, isLoaded } = useSignIn();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = useMemo(() => {
    if (Array.isArray(params.email)) return params.email[0] ?? "";
    return typeof params.email === "string" ? params.email : "";
  }, [params.email]);

  const [email, setEmail] = useState(initialEmail);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSendResetLinkPress = async () => {
    if (!isLoaded || isSubmitting) return;
    if (!isValidEmail(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setIsSubmitting(true);
      await resetPasswordForEmail(email);
      setStatusMessage("Reset link sent. Check your email.");
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Could not send reset link."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendDisabled = !isLoaded || isSubmitting || !email;

  return (
    <SafeAreaView style={styles.safeArea}>
      {Platform.OS !== "web" ? (
        <View style={styles.backgroundDecoration}>
          <View style={[styles.blob, styles.blob1]} />
          <View style={[styles.blob, styles.blob2]} />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView
          automaticallyAdjustsScrollIndicatorInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require("@/assets/icon_nobg.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we&apos;ll send a reset link
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

            {!!statusMessage && (
              <View style={styles.messageContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={COLORS.text}
                />
                <Text style={styles.statusMessage}>{statusMessage}</Text>
              </View>
            )}

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
              disabled={sendDisabled}
              onPress={onSendResetLinkPress}
              style={({ pressed }) => [
                styles.primaryButton,
                sendDisabled && styles.disabledButton,
                pressed && !sendDisabled && styles.pressedButton,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={COLORS.background}
                  />
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }
                router.replace("/sign-in");
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardContainer: {
    flex: 1,
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
    paddingBottom: 28,
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
  statusMessage: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
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
  secondaryButton: {
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textDecorationLine: "underline",
  },
});
