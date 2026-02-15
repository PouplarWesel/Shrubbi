import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { Boogaloo_400Regular } from "@expo-google-fonts/boogaloo";
import { useFonts } from "expo-font";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedAppSplash } from "@/components/AnimatedAppSplash";
import { useSupabase } from "@/hooks/useSupabase";
import {
  cancelWateringRemindersAsync,
  syncWateringRemindersForUserAsync,
} from "@/lib/wateringNotifications";
import { SupabaseProvider } from "@/providers/supabase-provider";
import "@/lib/mapbox";

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
  const { isLoaded, session, supabase } = useSupabase();
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

  useEffect(() => {
    if (Platform.OS === "web") return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let isMounted = true;

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as any;
      const route = typeof data?.route === "string" ? data.route : null;
      if (!route) return;
      router.push(route);
    };

    const hydrateInitial = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!isMounted || !response) return;
        handleResponse(response);
      } catch {
        // Ignore.
      }
    };

    void hydrateInitial();

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const userId = session?.user?.id ?? null;

    if (!userId) {
      void cancelWateringRemindersAsync();
      return;
    }

    void syncWateringRemindersForUserAsync(supabase, userId);
  }, [isLoaded, session?.user?.id, supabase]);

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
