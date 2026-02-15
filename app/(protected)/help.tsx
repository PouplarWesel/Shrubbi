import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { COLORS } from "@/constants/colors";

type HelpStep = {
  title: string;
  detail: string;
};

type HelpTopic = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  forWho: string;
  steps: HelpStep[];
  tip: string;
  route: string | null;
};

const HELP_TOPICS: HelpTopic[] = [
  {
    id: "start",
    icon: "sparkles",
    title: "Getting Started",
    summary: "The fastest way to understand Shrubbi from day one.",
    forWho: "New users or anyone returning after a while.",
    steps: [
      {
        title: "Complete profile basics",
        detail:
          "Set your full name, display name, and city so the app can show local groups and events.",
      },
      {
        title: "Run onboarding once",
        detail:
          "Onboarding explains the core loop: add plants, water on schedule, join groups, and track impact.",
      },
      {
        title: "Pick one first action",
        detail:
          "Best first action is adding a plant. Once you have one plant, the rest of the app becomes clearer.",
      },
    ],
    tip: "If the app feels overwhelming, ignore everything except Plants for your first day.",
    route: "/(protected)/onboarding",
  },
  {
    id: "home",
    icon: "home",
    title: "Home Dashboard",
    summary: "Your daily command center for goals, reminders, and progress.",
    forWho: "Anyone checking what to do next.",
    steps: [
      {
        title: "Read the top cards first",
        detail: "They show your current totals and what needs attention now.",
      },
      {
        title: "Use quick actions",
        detail:
          "Buttons on the page open common flows without hunting through tabs.",
      },
      {
        title: "Use Help from here",
        detail: "The Help button now opens this guide instead of onboarding.",
      },
    ],
    tip: "If you only have 60 seconds, just check watering tasks and mark what you finished.",
    route: "/(protected)/(tabs)",
  },
  {
    id: "plants",
    icon: "leaf",
    title: "Plants Screen",
    summary: "See your plant list, status, and what needs care today.",
    forWho: "Users managing personal plants and schedules.",
    steps: [
      {
        title: "Open the Plants tab",
        detail:
          "Each card shows key info like name, health context, and schedule signals.",
      },
      {
        title: "Tap a plant for details",
        detail:
          "Details let you update notes, photos, and maintenance over time.",
      },
      {
        title: "Use Add Plant when needed",
        detail:
          "Keep entries clean and simple. You can always improve details later.",
      },
    ],
    tip: "A small but accurate plant list is better than a big list with outdated data.",
    route: "/(protected)/(tabs)/plants",
  },
  {
    id: "add-plant",
    icon: "add-circle",
    title: "Add Plant Flow",
    summary: "How to add a plant quickly without getting stuck.",
    forWho: "Anyone adding their first few plants.",
    steps: [
      {
        title: "Choose the right plant type",
        detail:
          "Use clear names so reminders and history are easy to understand later.",
      },
      {
        title: "Set water schedule realistically",
        detail:
          "Pick a schedule you can actually keep. You can tune it after a week.",
      },
      {
        title: "Save now, refine later",
        detail:
          "Do not over-optimize the first entry. Fast save is usually the best move.",
      },
    ],
    tip: "Use custom names like 'Kitchen Pothos' so reminders are obvious.",
    route: "/(protected)/add-plant",
  },
  {
    id: "map",
    icon: "map",
    title: "Map Screen",
    summary: "Track regional activity and see where impact is happening.",
    forWho: "People curious about local momentum and community progress.",
    steps: [
      {
        title: "Open Map tab and wait for load",
        detail:
          "Stats and overlays can take a moment while location and city data resolve.",
      },
      {
        title: "Use map cards for context",
        detail:
          "Cards summarize what the map is showing so numbers make sense quickly.",
      },
      {
        title: "Compare activity over time",
        detail:
          "Use repeated checks to understand trend direction instead of one-time snapshots.",
      },
    ],
    tip: "If map cards feel too dense, focus on one metric at a time.",
    route: "/(protected)/(tabs)/map",
  },
  {
    id: "social",
    icon: "chatbubbles",
    title: "Social and Chat",
    summary: "Talk with your city/team and coordinate actions.",
    forWho: "Users joining discussion and media sharing.",
    steps: [
      {
        title: "Start in city channel",
        detail:
          "City chat is the broadest context. Team channels are better for tighter coordination.",
      },
      {
        title: "Use threads when needed",
        detail:
          "Threads keep side discussions from cluttering the main channel.",
      },
      {
        title: "Know web phone limits",
        detail:
          "On phone web, chat can be viewed but typing/upload may be disabled by design.",
      },
    ],
    tip: "Short, specific messages get better responses than long general posts.",
    route: "/(protected)/(tabs)/social",
  },
  {
    id: "events",
    icon: "calendar",
    title: "Events",
    summary: "Create, join, and manage local events clearly.",
    forWho: "Group members planning cleanups or meetups.",
    steps: [
      {
        title: "Set clear title and location",
        detail:
          "People join faster when event title and location are unambiguous.",
      },
      {
        title: "Use realistic time windows",
        detail:
          "Avoid overly long windows; concise schedules improve attendance quality.",
      },
      {
        title: "Track attendance states",
        detail:
          "Going/waitlist/cancelled helps everyone understand actual turnout.",
      },
    ],
    tip: "A clear location note usually matters more than a long description.",
    route: "/(protected)/(tabs)/social",
  },
  {
    id: "groups",
    icon: "people",
    title: "Groups and Teams",
    summary: "How groups work and what switching teams does.",
    forWho: "Users choosing where to participate.",
    steps: [
      {
        title: "Open Social > Groups",
        detail:
          "You can browse available groups in your city and see member counts.",
      },
      {
        title: "Switching teams is exclusive",
        detail:
          "When you switch, the app removes previous team memberships first, then joins the new team.",
      },
      {
        title: "Data refreshes after switch",
        detail:
          "Channels, memberships, and related social data reload after each team change.",
      },
    ],
    tip: "Switch only when you want a new primary team context.",
    route: "/(protected)/(tabs)/social",
  },
  {
    id: "settings",
    icon: "settings",
    title: "Profile and Settings",
    summary: "Update identity, avatar, and location cleanly.",
    forWho: "Anyone personalizing account data.",
    steps: [
      {
        title: "Keep profile names stable",
        detail:
          "Frequent name changes make social and history harder for others to follow.",
      },
      {
        title: "Select location from suggestions",
        detail:
          "Using suggestion picks avoids mismatches and keeps city linkage correct.",
      },
      {
        title: "Save after edits",
        detail: "The Save action confirms updates to your profile data.",
      },
    ],
    tip: "If location does not save, pick from the dropdown list exactly once and save again.",
    route: "/(protected)/(tabs)",
  },
];

const getTopicById = (id: string) =>
  HELP_TOPICS.find((topic) => topic.id === id) ?? HELP_TOPICS[0];

export default function HelpPage() {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const [activeTopicId, setActiveTopicId] = useState(HELP_TOPICS[0].id);

  const activeTopic = useMemo(
    () => getTopicById(activeTopicId),
    [activeTopicId],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {Platform.OS !== "web" ? (
        <View style={styles.backgroundDecoration}>
          <View style={[styles.glowBlob, styles.glowBlobTop]} />
          <View style={[styles.glowBlob, styles.glowBlobBottom]} />
        </View>
      ) : null}

      <View
        style={[
          styles.container,
          Platform.OS === "android" && styles.containerAndroid,
          isWide && styles.containerWide,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }
                router.replace("/(protected)/(tabs)");
              }}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
            </Pressable>
            <View>
              <Text style={styles.title}>Knowledge Base</Text>
              <Text style={styles.subtitle}>Master the Shrubbi ecosystem</Text>
            </View>
          </View>
        </View>

        {isWide ? (
          <View style={styles.wideLayout}>
            <ScrollView
              style={styles.topicRail}
              contentContainerStyle={styles.topicRailContent}
              showsVerticalScrollIndicator={false}
            >
              {HELP_TOPICS.map((topic) => {
                const isActive = topic.id === activeTopic.id;
                return (
                  <Pressable
                    key={topic.id}
                    onPress={() => setActiveTopicId(topic.id)}
                    style={[
                      styles.topicItem,
                      isActive && styles.topicItemActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.topicIconSmall,
                        isActive && styles.topicIconSmallActive,
                      ]}
                    >
                      <Ionicons
                        name={topic.icon as any}
                        size={18}
                        color={isActive ? COLORS.background : COLORS.primary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.topicItemText,
                        isActive && styles.topicItemTextActive,
                      ]}
                    >
                      {topic.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView
              style={styles.detailPane}
              contentContainerStyle={styles.detailPaneContent}
              showsVerticalScrollIndicator={false}
            >
              <HelpTopicPanel topic={activeTopic} />
            </ScrollView>
          </View>
        ) : (
          <>
            <View style={styles.mobileNavContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.topicRow}
              >
                {HELP_TOPICS.map((topic) => {
                  const isActive = topic.id === activeTopic.id;
                  return (
                    <Pressable
                      key={topic.id}
                      onPress={() => setActiveTopicId(topic.id)}
                      style={[
                        styles.topicChip,
                        isActive && styles.topicChipActive,
                      ]}
                    >
                      <Ionicons
                        name={topic.icon as any}
                        size={16}
                        color={isActive ? COLORS.background : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.topicChipText,
                          isActive && styles.topicChipTextActive,
                        ]}
                      >
                        {topic.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView
              style={styles.detailPane}
              contentContainerStyle={styles.detailPaneContent}
              showsVerticalScrollIndicator={false}
            >
              <HelpTopicPanel topic={activeTopic} />
            </ScrollView>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function HelpTopicPanel({ topic }: { topic: HelpTopic }) {
  return (
    <BlurView intensity={25} tint="dark" style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <View style={styles.topicIconWrap}>
          <Ionicons name={topic.icon as any} size={28} color={COLORS.primary} />
        </View>
        <View style={styles.detailHeaderText}>
          <Text style={styles.detailTitle}>{topic.title}</Text>
          <Text style={styles.detailSummary}>{topic.summary}</Text>
        </View>
      </View>

      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{topic.forWho}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.contentSection}>
        <Text style={styles.sectionTitle}>Step-by-Step Guide</Text>
        <View style={styles.stepsList}>
          {topic.steps.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepConnectorContainer}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                {index < topic.steps.length - 1 && (
                  <View style={styles.stepConnector} />
                )}
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.proTipContainer}>
        <LinearGradient
          colors={[COLORS.primary + "15", COLORS.primary + "05"]}
          style={styles.proTipBg}
        />
        <View style={styles.proTipIcon}>
          <Ionicons name="bulb" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.proTipContent}>
          <Text style={styles.proTipTitle}>Pro Tip</Text>
          <Text style={styles.proTipText}>{topic.tip}</Text>
        </View>
      </View>

      <View style={styles.footerActions}>
        {topic.route ? (
          <Pressable
            onPress={() => router.push(topic.route as any)}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryActionText}>
              Navigate to {topic.title}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={COLORS.background}
            />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push("/(protected)/onboarding")}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>Restart Tour</Text>
        </Pressable>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: -1,
  },
  glowBlob: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.15,
  },
  glowBlobTop: {
    top: -100,
    right: -120,
    backgroundColor: COLORS.primary,
  },
  glowBlobBottom: {
    bottom: -150,
    left: -140,
    backgroundColor: COLORS.accent,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  containerAndroid: {
    paddingTop: 16 + (StatusBar.currentHeight ?? 0),
  },
  containerWide: {
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent + "80",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
    marginTop: -4,
  },
  wideLayout: {
    flex: 1,
    flexDirection: "row",
    gap: 24,
  },
  topicRail: {
    width: 280,
  },
  topicRailContent: {
    gap: 10,
    paddingBottom: 40,
  },
  topicItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.accent + "40",
    borderWidth: 1,
    borderColor: "transparent",
  },
  topicItemActive: {
    backgroundColor: COLORS.primary + "15",
    borderColor: COLORS.primary + "30",
  },
  topicIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  topicIconSmallActive: {
    backgroundColor: COLORS.primary,
  },
  topicItemText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  topicItemTextActive: {
    color: COLORS.primary,
    opacity: 1,
  },
  mobileNavContainer: {
    marginBottom: 20,
  },
  topicRow: {
    gap: 10,
    paddingRight: 20,
  },
  topicChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.accent + "60",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topicChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  topicChipText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  topicChipTextActive: {
    color: COLORS.background,
  },
  detailPane: {
    flex: 1,
  },
  detailPaneContent: {
    paddingBottom: 60,
  },
  detailCard: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    overflow: "hidden",
    padding: 24,
  },
  detailHeader: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  topicIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  detailHeaderText: {
    flex: 1,
  },
  detailTitle: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 34,
  },
  detailSummary: {
    color: COLORS.text,
    opacity: 0.7,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 20,
    marginTop: 4,
  },
  badgeContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },
  badge: {
    backgroundColor: COLORS.secondary + "20",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
  },
  badgeText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.primary + "15",
    marginBottom: 24,
  },
  contentSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 20,
    opacity: 0.9,
  },
  stepsList: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    gap: 16,
  },
  stepConnectorContainer: {
    alignItems: "center",
    width: 32,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stepNumberText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  stepConnector: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.primary + "30",
    marginVertical: -2,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 24,
  },
  stepTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 22,
  },
  stepDetail: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.75,
    lineHeight: 20,
    marginTop: 4,
  },
  proTipContainer: {
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  proTipBg: {
    ...StyleSheet.absoluteFillObject,
  },
  proTipIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  proTipContent: {
    flex: 1,
  },
  proTipTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 4,
  },
  proTipText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
    lineHeight: 18,
  },
  footerActions: {
    gap: 12,
  },
  primaryAction: {
    borderRadius: 20,
    height: 56,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: COLORS.background,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  secondaryAction: {
    borderRadius: 20,
    height: 52,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.primary + "05",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: COLORS.primary,
    fontSize: 17,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
