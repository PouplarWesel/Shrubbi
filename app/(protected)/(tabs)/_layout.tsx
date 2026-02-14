import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_HEIGHT = 68;
const TAB_BAR_RADIUS = TAB_BAR_HEIGHT / 2;
const TAB_BAR_SIDE_INSET = 20;
const TAB_BAR_PADDING_Y = 10;

const ICON_SIZE = 44;
const ICON_RADIUS = ICON_SIZE / 2;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.secondary + "99",
        tabBarShowLabel: false,
        safeAreaInsets: {
          bottom: 0,
          top: 0,
          left: 0,
          right: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarStyle: {
          position: "absolute",
          left: TAB_BAR_SIDE_INSET,
          right: TAB_BAR_SIDE_INSET,
          bottom: bottomInset > 0 ? bottomInset : 24,
          backgroundColor: "transparent",
          borderRadius: TAB_BAR_RADIUS,
          height: TAB_BAR_HEIGHT,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(171, 216, 189, 0.12)",
          paddingTop: TAB_BAR_PADDING_Y,
          paddingBottom: TAB_BAR_PADDING_Y,
          elevation: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 14,
        },
        tabBarHideOnKeyboard: true,
        tabBarBackground: () => (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: TAB_BAR_RADIUS, overflow: "hidden" },
            ]}
          >
            <LinearGradient
              colors={["rgba(7, 41, 0, 0.72)", "rgba(0, 15, 13, 0.95)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["rgba(191, 244, 253, 0.14)", "rgba(191, 244, 253, 0)"]}
              start={{ x: 0.05, y: 0.05 }}
              end={{ x: 0.7, y: 0.9 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              icon={focused ? "home" : "home-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              icon={focused ? "people" : "people-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              icon={focused ? "map" : "map-outline"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="plants"
        options={{
          title: "Plants",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              icon={focused ? "leaf" : "leaf-outline"}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  focused,
  color,
  icon,
}: {
  focused: boolean;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.iconContainer}>
      <View style={[styles.iconWrapper, focused && styles.activeIconWrapper]}>
        {focused && (
          <LinearGradient
            colors={["rgba(191, 244, 253, 0.16)", "rgba(191, 244, 253, 0.05)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: ICON_RADIUS }]}
          />
        )}
        <Ionicons name={icon} size={26} color={color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: ICON_RADIUS,
    overflow: "hidden",
  },
  activeIconWrapper: {
    backgroundColor: "rgba(191, 244, 253, 0.1)",
  },
});
