import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";

type AnimatedAppSplashProps = {
  onAnimationComplete: () => void;
};

const SPLASH_BACKGROUND = "#004140";
const SPLASH_ICON = require("../assets/icon_nobg.png") as ImageSourcePropType;

export function AnimatedAppSplash({
  onAnimationComplete,
}: AnimatedAppSplashProps) {
  const showBurstRings = Platform.OS !== "web";
  const iconScale = useRef(new Animated.Value(0.72)).current;
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const burstScale = useRef(new Animated.Value(0.36)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const burstScaleSoft = useRef(new Animated.Value(0.2)).current;
  const burstOpacitySoft = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(iconScale, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacity, {
          toValue: 0.24,
          duration: 360,
          delay: 190,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacitySoft, {
          toValue: 0.16,
          duration: 420,
          delay: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(iconScale, {
          toValue: 3.1,
          duration: 1100,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 0,
          duration: 1050,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(burstScale, {
          toValue: 4,
          duration: 1120,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacity, {
          toValue: 0,
          duration: 1120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(burstScaleSoft, {
          toValue: 5.2,
          duration: 1180,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacitySoft, {
          toValue: 0,
          duration: 1180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(180),
    ]);

    animation.start(({ finished }) => {
      if (finished && isMounted) {
        onAnimationComplete();
      }
    });

    return () => {
      isMounted = false;
      animation.stop();
    };
  }, [
    burstOpacity,
    burstOpacitySoft,
    burstScale,
    burstScaleSoft,
    iconOpacity,
    iconScale,
    onAnimationComplete,
  ]);

  return (
    <View style={styles.container}>
      {showBurstRings ? (
        <>
          <Animated.View
            style={[
              styles.burstRing,
              {
                opacity: burstOpacity,
                transform: [{ scale: burstScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.burstRingSoft,
              {
                opacity: burstOpacitySoft,
                transform: [{ scale: burstScaleSoft }],
              },
            ]}
          />
        </>
      ) : null}
      <Animated.Image
        source={SPLASH_ICON}
        style={[
          styles.icon,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  icon: {
    width: 210,
    height: 210,
  },
  burstRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 20,
    borderColor: "#8CBAB2",
  },
  burstRingSoft: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 12,
    borderColor: "#6FA59B",
  },
});
