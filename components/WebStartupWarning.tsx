import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { COLORS } from "@/constants/colors";

const DISMISS_WAIT_SECONDS = 3;
const APK_URL = "https://github.com/PouplarWesel/Shrubbi/releases";

export function WebStartupWarning() {
  const [visible, setVisible] = useState(Platform.OS === "web");
  const [secondsLeft, setSecondsLeft] = useState(DISMISS_WAIT_SECONDS);
  const isPhoneWeb = useMemo(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
    return /android|iphone|ipod|mobile/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;

    setSecondsLeft(DISMISS_WAIT_SECONDS);
    const countdownInterval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [visible]);

  if (!visible || Platform.OS !== "web") {
    return null;
  }

  const canClose = secondsLeft <= 0;
  const iconName = isPhoneWeb ? "phone-portrait" : "laptop-outline";
  const title = isPhoneWeb
    ? "Best On Android App"
    : "Web Is Limited On Desktop";
  const message = isPhoneWeb
    ? "You are on mobile web. For the true Shrubbi experience, download the Android app from Releases."
    : "You are on desktop web. Shrubbi is built for Android first. If possible, download the app. If you cannot right now, use the website on your phone for a better web experience.";
  const linkLabel = isPhoneWeb
    ? "Download Android app from Releases"
    : "Download Android app (Releases)";

  const handleOpenApkLink = () => {
    void Linking.openURL(APK_URL);
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <View style={styles.iconWrap}>
          <Ionicons name={iconName} size={28} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Pressable onPress={handleOpenApkLink} hitSlop={8}>
          <Text style={styles.link}>{linkLabel}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!canClose}
          onPress={() => setVisible(false)}
          style={[styles.closeButton, !canClose && styles.closeButtonDisabled]}
        >
          <Text
            style={[
              styles.closeButtonText,
              !canClose && styles.closeButtonTextDisabled,
            ]}
          >
            {canClose ? "Continue on Web" : `Continue in ${secondsLeft}s`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: "rgba(0, 15, 13, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modal: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.secondary + "44",
    backgroundColor: COLORS.background + "FA",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent + "AA",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontFamily: "Boogaloo_400Regular",
  },
  message: {
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 24,
    textAlign: "center",
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  link: {
    color: COLORS.primary,
    fontSize: 17,
    fontFamily: "Boogaloo_400Regular",
    textDecorationLine: "underline",
  },
  closeButton: {
    marginTop: 4,
    minHeight: 46,
    minWidth: 190,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  closeButtonDisabled: {
    backgroundColor: COLORS.accent + "CC",
    borderWidth: 1,
    borderColor: COLORS.secondary + "3D",
  },
  closeButtonText: {
    color: COLORS.background,
    fontSize: 17,
    fontFamily: "Boogaloo_400Regular",
  },
  closeButtonTextDisabled: {
    color: COLORS.secondary,
  },
});
