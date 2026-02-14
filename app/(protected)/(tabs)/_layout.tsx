import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { StyleSheet, View, Platform } from "react-native";
import { BlurView } from "expo-blur";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.secondary + "80",
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          bottom: 24,
          left: 20,
          right: 20,
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : COLORS.background + "E6",
          borderRadius: 24,
          height: 64,
          borderTopWidth: 0,
          paddingBottom: 0,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          overflow: "hidden",
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              tint="dark"
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.iconWrapper, focused && styles.activeIconWrapper]}
            >
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.iconWrapper, focused && styles.activeIconWrapper]}
            >
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="plants"
        options={{
          title: "Plants",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[styles.iconWrapper, focused && styles.activeIconWrapper]}
            >
              <Ionicons
                name={focused ? "leaf" : "leaf-outline"}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 22,
  },
  activeIconWrapper: {
    backgroundColor: COLORS.primary + "15",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
});
