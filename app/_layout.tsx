import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { Boogaloo_400Regular } from "@expo-google-fonts/boogaloo";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedAppSplash } from "@/components/AnimatedAppSplash";
import { useSupabase } from "@/hooks/useSupabase";
import { SupabaseProvider } from "@/providers/supabase-provider";

SplashScreen.setOptions({
  duration: 200,
  fade: false,
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SupabaseProvider>
        <RootNavigator />
      </SupabaseProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { isLoaded, session } = useSupabase();
  const [fontsLoaded] = useFonts({
    Boogaloo_400Regular,
  });
  const [isAppReady, setIsAppReady] = useState(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  const handleAnimatedSplashComplete = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  useEffect(() => {
    if (!isLoaded || !fontsLoaded) return;

    let isMounted = true;

    const finalizeSplash = async () => {
      await SplashScreen.hideAsync();
      if (isMounted) {
        setIsAppReady(true);
      }
    };

    void finalizeSplash();

    return () => {
      isMounted = false;
    };
  }, [fontsLoaded, isLoaded]);

  if (!isAppReady) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#004140" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: "none",
          animationDuration: 0,
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(protected)" />
        </Stack.Protected>

        <Stack.Protected guard={!session}>
          <Stack.Screen name="(public)" />
        </Stack.Protected>
      </Stack>

      {showAnimatedSplash ? (
        <AnimatedAppSplash onAnimationComplete={handleAnimatedSplashComplete} />
      ) : null}
    </View>
  );
}
