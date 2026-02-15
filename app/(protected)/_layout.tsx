import { Stack } from "expo-router";

export default function ProtectedLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="help"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="add-plant"
        options={{
          headerShown: true,
          title: "Add Plant",
          headerStyle: { backgroundColor: "#000f0d" },
          headerTintColor: "#bff4fd",
        }}
      />
      <Stack.Screen
        name="plant/[id]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
