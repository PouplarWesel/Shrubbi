import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function PublicLayout() {
  return (
    <Stack
      initialRouteName="welcome"
      screenOptions={{
        headerShown: false,
        animation:
          Platform.OS === "ios" ? "ios_from_right" : "fade_from_bottom",
        animationDuration: 260,
        animationTypeForReplace: "push",
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="welcome"
        options={{
          animation: "fade",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
