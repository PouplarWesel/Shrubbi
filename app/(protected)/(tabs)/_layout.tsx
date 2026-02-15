import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const TAB_BAR_HEIGHT = 56;
const TAB_BAR_RADIUS = TAB_BAR_HEIGHT / 2;
const TAB_BAR_SIDE_INSET = 20;
const TAB_BAR_BOTTOM_GAP = 10;

const ICON_SIZE = 38;
const ICON_RADIUS = ICON_SIZE / 2;
const ICON_GLYPH_SIZE = 24;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} bottomInset={bottomInset} />}
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.secondary + "99",
        tabBarShowLabel: false,
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

function CustomTabBar({
  state,
  descriptors,
  navigation,
  bottomInset,
}: BottomTabBarProps & { bottomInset: number }) {
  return (
    <View
      style={[
        styles.tabBarStack,
        { bottom: Math.max(bottomInset, TAB_BAR_BOTTOM_GAP) },
      ]}
    >
      <View style={styles.tabBarContainer}>
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

        <View style={styles.tabRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];

            const activeColor =
              (options.tabBarActiveTintColor as string | undefined) ??
              COLORS.primary;
            const inactiveColor =
              (options.tabBarInactiveTintColor as string | undefined) ??
              COLORS.secondary + "99";
            const color = isFocused ? activeColor : inactiveColor;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.tabButton}
              >
                <View style={styles.iconSlot}>
                  {typeof options.tabBarIcon === "function"
                    ? options.tabBarIcon({
                        focused: isFocused,
                        color,
                        size: ICON_GLYPH_SIZE,
                      })
                    : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
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
        <Ionicons
          name={icon}
          size={ICON_GLYPH_SIZE}
          color={color}
          style={styles.iconGlyph}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarStack: {
    position: "absolute",
    left: TAB_BAR_SIDE_INSET,
    right: TAB_BAR_SIDE_INSET,
  },
  tabBarContainer: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_RADIUS,
    backgroundColor: "rgba(0, 15, 13, 0.92)",
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(171, 216, 189, 0.12)",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  tabButton: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconSlot: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    width: ICON_SIZE,
    height: ICON_SIZE,
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
  iconGlyph: {
    lineHeight: ICON_GLYPH_SIZE,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  activeIconWrapper: {
    backgroundColor: "rgba(191, 244, 253, 0.1)",
  },
});
