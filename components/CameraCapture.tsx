import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";

import { COLORS } from "@/constants/colors";

type CameraCaptureProps = {
  onCapture: (uri: string, mimeType: string, base64?: string | null) => void;
  onClose: () => void;
};

export const CameraCapture = ({ onCapture, onClose }: CameraCaptureProps) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("front");
  const [isTaking, setIsTaking] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const viewfinderSize = useMemo(
    () => Math.min(width * 0.78, height * 0.46, 360),
    [width, height],
  );

  const toggleFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const takePicture = async () => {
    if (!cameraRef.current || isTaking) return;

    setIsTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
        exif: false,
        base64: true,
      });

      if (photo?.uri) {
        onCapture(photo.uri, "image/jpeg", photo.base64 ?? null);
      }
    } catch (error) {
      console.error("Failed to take picture:", error);
    } finally {
      setIsTaking(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Initializing Lens...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close-circle" size={32} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="camera-outline" size={60} color={COLORS.primary} />
            <View style={styles.lockBadge}>
              <Ionicons
                name="lock-closed"
                size={16}
                color={COLORS.background}
              />
            </View>
          </View>
          <Text style={styles.permissionTitle}>Vision Required</Text>
          <Text style={styles.permissionText}>
            We need to see your beautiful plants. Grant camera access to
            continue.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.grantButton,
              pressed && styles.pressed,
            ]}
            onPress={requestPermission}
          >
            <Text style={styles.grantButtonText}>Enable Camera</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={COLORS.background}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onClose}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Capture Photo</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={toggleFacing}
        >
          <Ionicons name="camera-reverse" size={26} color="#fff" />
        </Pressable>
      </View>

      <View
        style={[
          styles.captureStage,
          {
            paddingTop: insets.top + 72,
            paddingBottom: insets.bottom + 148,
          },
        ]}
      >
        <View
          style={[
            styles.cameraCircleOuter,
            {
              width: viewfinderSize + 12,
              height: viewfinderSize + 12,
              borderRadius: (viewfinderSize + 12) / 2,
            },
          ]}
        >
          <View
            style={[
              styles.cameraCircle,
              {
                width: viewfinderSize,
                height: viewfinderSize,
                borderRadius: viewfinderSize / 2,
              },
            ]}
          >
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
              mode="picture"
              ratio="1:1"
            />
          </View>
        </View>
        <Text style={styles.captureHint}>CENTER YOUR FACE IN THE CIRCLE</Text>
      </View>

      <View style={[styles.bottomBar, { bottom: insets.bottom + 18 }]}>
        <View style={styles.shutterWrapper}>
          <View style={styles.shutterRing}>
            <Pressable
              style={({ pressed }) => [
                styles.shutterButton,
                pressed && styles.shutterPressed,
                isTaking && styles.shutterDisabled,
              ]}
              onPress={takePicture}
              disabled={isTaking}
            >
              {isTaking && <ActivityIndicator color={COLORS.primary} />}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  captureStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cameraCircleOuter: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.primary + "70",
    backgroundColor: "rgba(255,255,255,0.04)",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  cameraCircle: {
    overflow: "hidden",
    backgroundColor: "#111",
  },
  camera: {
    width: "100%",
    height: "100%",
  },
  captureHint: {
    marginTop: 18,
    color: "#fff",
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    letterSpacing: 1.1,
    textAlign: "center",
    opacity: 0.9,
  },
  loadingText: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 16,
    letterSpacing: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  lockIconContainer: {
    marginBottom: 24,
    position: "relative",
  },
  lockBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#000",
  },
  permissionTitle: {
    color: COLORS.primary,
    fontSize: 28,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 12,
    textAlign: "center",
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    lineHeight: 24,
    opacity: 0.7,
    marginBottom: 32,
  },
  grantButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  grantButtonText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    letterSpacing: 1,
    opacity: 0.9,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  shutterWrapper: {
    padding: 20,
  },
  shutterRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 4,
    borderColor: "#fff",
    padding: 7,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterButton: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterPressed: {
    transform: [{ scale: 0.9 }],
    backgroundColor: "#ddd",
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  closeButton: {
    position: "absolute",
    top: 60,
    left: 24,
    zIndex: 20,
  },
});
