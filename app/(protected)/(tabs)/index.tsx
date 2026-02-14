import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraCapture } from "@/components/CameraCapture";
import { SettingsSection } from "@/components/Settings";
import type { SettingsSectionHandle } from "@/components/Settings";
import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import { isDueToWaterNow } from "@/lib/wateringSchedule";

const { width } = Dimensions.get("window");
const FALLBACK_DAILY_TIP =
  "Succulents love bright, indirect sunlight. Make sure yours are getting enough light today!";
const DAILY_QUEST_CODE = "water_plant_daily";
const ACHIEVEMENT_CODES = [
  "green_thumb",
  "plant_parcut",
  "community_ledger",
  "native_protector",
  "so_thirsty",
  "carbon_sink",
] as const;
const ACHIEVEMENT_IMAGE_BY_CODE: Partial<Record<string, any>> = {
  green_thumb: require("@/assets/achievments/green_thumb.webp"),
  native_protector: require("@/assets/achievments/native_protector.webp"),
  carbon_sink: require("@/assets/achievments/carbon_sink.webp"),
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

type TipHistoryRow = {
  id: number;
  tip_date: string;
  tip_text: string;
};

type PlantScheduleRow = {
  quantity: number;
  co2_kg_per_year_override: number | null;
  water_days: number[] | null;
  water_time: string | null;
  last_watered_at: string | null;
  watering_points: number;
  plant:
    | { is_native: boolean; default_co2_kg_per_year: number }
    | { is_native: boolean; default_co2_kg_per_year: number }[]
    | null;
};

type DailyQuestDefinitionRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  points: number;
  target_count: number;
};

type UserDailyQuestRow = {
  progress_count: number;
  completed_at: string | null;
  claimed_at: string | null;
};

type AchievementDefinitionRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  points: number;
};

type UserAchievementRow = {
  achievement_id: string;
  earned_at: string;
};

type DailyQuestCard = {
  title: string;
  description: string;
  progress: number;
  target: number;
  points: number;
  completed: boolean;
};

type AchievementCard = {
  code: string;
  title: string;
  description: string;
  points: number;
  earnedAt: string | null;
  unlocked: boolean;
};

type ProgressSnapshot = {
  totalPlants: number;
  nativePlants: number;
  wateredPlants: number;
  wateredToday: boolean;
  isCommunityLeader: boolean;
  carbonPerYearKg: number;
};

function takeOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const formatTipDate = (tipDate: string) => {
  const localDate = new Date(`${tipDate}T00:00:00`);

  return localDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function Page() {
  const { signOut, session, supabase, isLoaded } = useSupabase();
  const insets = useSafeAreaInsets();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [dailyTipText, setDailyTipText] = useState(FALLBACK_DAILY_TIP);
  const [isDailyTipLoading, setIsDailyTipLoading] = useState(true);
  const [tipHistoryRows, setTipHistoryRows] = useState<TipHistoryRow[]>([]);
  const [isTipHistoryLoading, setIsTipHistoryLoading] = useState(false);
  const [tipHistoryError, setTipHistoryError] = useState("");
  const [plantTotal, setPlantTotal] = useState(0);
  const [toWaterTotal, setToWaterTotal] = useState(0);
  const [dailyQuest, setDailyQuest] = useState<DailyQuestCard | null>(null);
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const settingsBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const tipsHistoryBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const achievementsBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const settingsSnapPoints = useMemo(() => ["72%", "95%"], []);
  const tipHistorySnapPoints = useMemo(() => ["92%", "100%"], []);
  const achievementsSnapPoints = useMemo(() => ["72%", "92%"], []);

  const settingsRef = useRef<SettingsSectionHandle>(null);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and profile data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: handleDeleteAccount,
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase.rpc("delete_my_account");

      if (error) {
        Alert.alert("Delete failed", error.message);
        return;
      }

      await signOut();
    } catch (err) {
      Alert.alert("Delete failed", "Please try again.");
      console.error(JSON.stringify(err, null, 2));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenSettings = () => {
    settingsBottomSheetModalRef.current?.present();
    settingsBottomSheetModalRef.current?.snapToIndex(0);
  };

  const handleOpenAchievements = () => {
    achievementsBottomSheetModalRef.current?.present();
    achievementsBottomSheetModalRef.current?.snapToIndex(0);
  };

  const handleRequestCamera = () => {
    setIsCameraOpen(true);
  };

  const handleCameraCapture = (
    uri: string,
    mimeType: string,
    base64?: string | null,
  ) => {
    void settingsRef.current?.handleCameraPhoto({ uri, mimeType, base64 });
    setIsCameraOpen(false);
  };

  const handleCameraClose = () => {
    setIsCameraOpen(false);
  };

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!isLoaded || !userId) return;
    let isCancelled = false;

    const loadProfileName = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (isCancelled) return;
      if (error) {
        setProfileName(null);
        return;
      }

      const nextName =
        data?.full_name?.trim() || data?.display_name?.trim() || null;
      setProfileName(nextName);
    };

    void loadProfileName();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, supabase, userId]);

  const loadTipHistory = async () => {
    if (!isLoaded || !userId) {
      setTipHistoryRows([]);
      setTipHistoryError("");
      setIsTipHistoryLoading(false);
      return;
    }

    setIsTipHistoryLoading(true);
    setTipHistoryError("");

    const today = formatLocalDate(new Date());
    const { data, error } = await supabase
      .from("daily_tips")
      .select("id, tip_date, tip_text")
      .lte("tip_date", today)
      .order("tip_date", { ascending: false })
      .limit(100);

    if (error) {
      setTipHistoryRows([]);
      setTipHistoryError("Could not load tip history.");
      setIsTipHistoryLoading(false);
      return;
    }

    setTipHistoryRows((data ?? []) as TipHistoryRow[]);
    setIsTipHistoryLoading(false);
  };

  const handleOpenTipsHistory = () => {
    tipsHistoryBottomSheetModalRef.current?.present();
    void loadTipHistory();
  };

  const syncDailyQuest = useCallback(
    async (snapshot: ProgressSnapshot) => {
      if (!userId) return;

      const { data: questDef, error: questDefError } = await supabase
        .from("daily_quests")
        .select("id, code, title, description, points, target_count")
        .eq("code", DAILY_QUEST_CODE)
        .eq("is_active", true)
        .maybeSingle();

      if (questDefError || !questDef) {
        setDailyQuest(null);
        return;
      }

      const quest = questDef as DailyQuestDefinitionRow;
      const today = formatLocalDate(new Date());
      const progress = snapshot.wateredToday ? 1 : 0;
      const completed = progress >= quest.target_count;
      const nowIso = new Date().toISOString();

      const { data: existing } = await supabase
        .from("user_daily_quests")
        .select("progress_count, completed_at, claimed_at")
        .eq("user_id", userId)
        .eq("quest_id", quest.id)
        .eq("quest_date", today)
        .maybeSingle();

      const existingRow = (existing ?? null) as UserDailyQuestRow | null;
      const completedAt =
        existingRow?.completed_at ?? (completed ? nowIso : null);

      await supabase.from("user_daily_quests").upsert(
        {
          user_id: userId,
          quest_id: quest.id,
          quest_date: today,
          progress_count: progress,
          completed_at: completedAt,
        },
        {
          onConflict: "user_id,quest_id,quest_date",
        },
      );

      setDailyQuest({
        title: quest.title,
        description: quest.description ?? "Complete this quest today.",
        progress,
        target: quest.target_count,
        points: quest.points,
        completed:
          !!completedAt ||
          (existingRow?.progress_count ?? 0) >= quest.target_count,
      });
    },
    [supabase, userId],
  );

  const syncAchievements = useCallback(
    async (snapshot: ProgressSnapshot) => {
      if (!userId) return;

      const { data: defsData, error: defsError } = await supabase
        .from("achievements")
        .select("id, code, title, description, points")
        .in("code", [...ACHIEVEMENT_CODES])
        .eq("is_active", true);

      if (defsError || !defsData) {
        setAchievements([]);
        return;
      }

      const defs = defsData as AchievementDefinitionRow[];
      const unlockedByCode: Record<string, boolean> = {
        green_thumb: snapshot.totalPlants >= 1,
        plant_parcut: snapshot.totalPlants >= 5,
        community_ledger: snapshot.isCommunityLeader,
        native_protector: snapshot.nativePlants >= 15,
        so_thirsty: snapshot.wateredPlants >= 15,
        carbon_sink: snapshot.carbonPerYearKg >= 500,
      };

      const { data: earnedData } = await supabase
        .from("user_achievements")
        .select("achievement_id, earned_at")
        .eq("user_id", userId);

      const earnedRows = (earnedData ?? []) as UserAchievementRow[];
      const earnedById = new Map<string, string>(
        earnedRows.map((row) => [row.achievement_id, row.earned_at]),
      );

      const toInsert = defs
        .filter(
          (item) =>
            unlockedByCode[item.code] === true && !earnedById.has(item.id),
        )
        .map((item) => ({
          user_id: userId,
          achievement_id: item.id,
        }));

      if (toInsert.length > 0) {
        await supabase.from("user_achievements").upsert(toInsert, {
          onConflict: "user_id,achievement_id",
          ignoreDuplicates: true,
        });
      }

      const { data: earnedDataAfter } = await supabase
        .from("user_achievements")
        .select("achievement_id, earned_at")
        .eq("user_id", userId);

      const earnedAfter = new Map<string, string>(
        ((earnedDataAfter ?? []) as UserAchievementRow[]).map((row) => [
          row.achievement_id,
          row.earned_at,
        ]),
      );

      const ordered = [...defs].sort(
        (a, b) => a.points - b.points || a.title.localeCompare(b.title),
      );

      setAchievements(
        ordered.map((item) => ({
          code: item.code,
          title: item.title,
          description: item.description ?? "",
          points: item.points,
          earnedAt: earnedAfter.get(item.id) ?? null,
          unlocked: unlockedByCode[item.code] === true,
        })),
      );
    },
    [supabase, userId],
  );

  const loadPlantStats = useCallback(
    async (syncProgress = false) => {
      if (!isLoaded || !userId) {
        setPlantTotal(0);
        setToWaterTotal(0);
        setDailyQuest(null);
        setAchievements([]);
        return;
      }

      const [
        { data, error },
        { data: membershipRows },
        { data: createdTeamsRows },
      ] = await Promise.all([
        supabase
          .from("user_plants")
          .select(
            "quantity, co2_kg_per_year_override, water_days, water_time, last_watered_at, watering_points, plant:plants(is_native, default_co2_kg_per_year)",
          )
          .eq("user_id", userId),
        supabase
          .from("team_memberships")
          .select("team_id")
          .eq("user_id", userId),
        supabase.from("teams").select("id").eq("created_by", userId),
      ]);

      if (error) {
        setPlantTotal(0);
        setToWaterTotal(0);
        return;
      }

      const rows = (data ?? []) as PlantScheduleRow[];
      const now = new Date();
      const today = formatLocalDate(now);

      let nextPlantTotal = 0;
      let nextToWaterTotal = 0;
      let nativePlantTotal = 0;
      let wateredPointsTotal = 0;
      let wateredToday = false;
      let carbonPerYearKg = 0;

      for (const row of rows) {
        const quantity = row.quantity ?? 0;
        nextPlantTotal += quantity;
        wateredPointsTotal += row.watering_points ?? 0;

        const plantInfo = takeOne(row.plant);
        if (plantInfo?.is_native) {
          nativePlantTotal += quantity;
        }
        const co2PerPlant =
          row.co2_kg_per_year_override ??
          plantInfo?.default_co2_kg_per_year ??
          0;
        carbonPerYearKg += co2PerPlant * quantity;

        if (
          row.last_watered_at &&
          formatLocalDate(new Date(row.last_watered_at)) === today
        ) {
          wateredToday = true;
        }

        if (
          isDueToWaterNow(
            row.water_days,
            row.water_time,
            row.last_watered_at,
            now,
          )
        ) {
          nextToWaterTotal += quantity;
        }
      }

      setPlantTotal(nextPlantTotal);
      setToWaterTotal(nextToWaterTotal);

      const memberTeamIds = (membershipRows ?? [])
        .map((row) => row.team_id)
        .filter((value): value is string => typeof value === "string");
      const createdTeamIds = (createdTeamsRows ?? [])
        .map((row) => row.id)
        .filter((value): value is string => typeof value === "string");
      const relevantTeamIds = Array.from(
        new Set([...memberTeamIds, ...createdTeamIds]),
      );

      let hasFiveMemberCommunity = false;
      if (relevantTeamIds.length > 0) {
        const { data: teamMemberRows, error: teamMemberError } = await supabase
          .from("team_memberships")
          .select("team_id")
          .in("team_id", relevantTeamIds);

        if (!teamMemberError) {
          const teamCounts = new Map<string, number>();
          for (const row of teamMemberRows ?? []) {
            const key = row.team_id;
            teamCounts.set(key, (teamCounts.get(key) ?? 0) + 1);
          }
          hasFiveMemberCommunity = Array.from(teamCounts.values()).some(
            (count) => count >= 5,
          );
        }
      }

      if (syncProgress) {
        const snapshot: ProgressSnapshot = {
          totalPlants: nextPlantTotal,
          nativePlants: nativePlantTotal,
          wateredPlants: Math.floor(wateredPointsTotal / 10),
          wateredToday,
          isCommunityLeader: hasFiveMemberCommunity,
          carbonPerYearKg,
        };

        await Promise.all([
          syncDailyQuest(snapshot),
          syncAchievements(snapshot),
        ]);
      }
    },
    [isLoaded, supabase, syncAchievements, syncDailyQuest, userId],
  );

  useEffect(() => {
    void loadPlantStats(true);
  }, [loadPlantStats]);

  useFocusEffect(
    useCallback(() => {
      void loadPlantStats(true);
    }, [loadPlantStats]),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void loadPlantStats(false);
    }, 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [loadPlantStats]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!userId) {
      setIsDailyTipLoading(false);
      return;
    }

    let isCancelled = false;

    const loadDailyTip = async () => {
      const today = formatLocalDate(new Date());

      const { data: todayTip, error: todayTipError } = await supabase
        .from("daily_tips")
        .select("tip_text")
        .eq("tip_date", today)
        .maybeSingle();

      if (isCancelled) return;

      if (todayTipError) {
        console.error("Failed to fetch today's tip", todayTipError);
        setIsDailyTipLoading(false);
        return;
      }

      if (todayTip?.tip_text) {
        setDailyTipText(todayTip.tip_text);
        setIsDailyTipLoading(false);
        return;
      }

      const { data: nearestTip, error: nearestTipError } = await supabase
        .from("daily_tips")
        .select("tip_text")
        .lte("tip_date", today)
        .order("tip_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) return;

      if (nearestTipError) {
        console.error("Failed to fetch fallback daily tip", nearestTipError);
        setIsDailyTipLoading(false);
        return;
      }

      if (nearestTip?.tip_text) {
        setDailyTipText(nearestTip.tip_text);
      }

      setIsDailyTipLoading(false);
    };

    void loadDailyTip();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, userId, supabase]);

  const todayKey = formatLocalDate(new Date());
  const userEmail = session?.user?.email || "Gardener";
  const fallbackName = userEmail.split("@")[0];
  const userName = profileName || fallbackName;

  return (
    <BottomSheetModalProvider>
      <View style={styles.container}>
        <View style={styles.backgroundDecoration}>
          <View style={[styles.blob, styles.blob1]} />
          <View style={[styles.blob, styles.blob2]} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{userName}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={handleOpenAchievements}
                style={({ pressed }) => [
                  styles.settingsIconButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="trophy-outline"
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
              <Pressable
                onPress={handleOpenSettings}
                style={({ pressed }) => [
                  styles.settingsIconButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="settings-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Ionicons name="leaf-outline" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{plantTotal}</Text>
              <Text style={styles.statLabel}>Plants</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="water-outline" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{toWaterTotal}</Text>
              <Text style={styles.statLabel}>To Water</Text>
            </View>
          </View>

          <View style={styles.mainCard}>
            <Text style={styles.cardTitle}>Daily Tip</Text>
            <Text style={styles.cardText}>
              {isDailyTipLoading ? "Loading today's tip..." : dailyTipText}
            </Text>
            <Pressable
              style={styles.cardButton}
              onPress={handleOpenTipsHistory}
            >
              <Text style={styles.cardButtonText}>Learn More</Text>
            </Pressable>
          </View>

          <View style={styles.mainCard}>
            <Text style={styles.cardTitle}>Daily Quest</Text>
            {dailyQuest ? (
              <>
                <Text style={styles.questTitle}>{dailyQuest.title}</Text>
                <Text style={styles.cardText}>{dailyQuest.description}</Text>
                <View style={styles.questRow}>
                  <Text style={styles.questProgress}>
                    Progress: {dailyQuest.progress}/{dailyQuest.target}
                  </Text>
                  <Text style={styles.questPoints}>
                    +{dailyQuest.points} pts
                  </Text>
                </View>
                <Text style={styles.questStatus}>
                  {dailyQuest.completed ? "Completed" : "In progress"}
                </Text>
              </>
            ) : (
              <Text style={styles.cardText}>No daily quest is active.</Text>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.onboardingButton,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/(protected)/onboarding")}
            >
              <Ionicons
                name="school-outline"
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.onboardingText}>Onboarding</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.pressed,
              ]}
              onPress={handleSignOut}
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color={COLORS.secondary}
              />
              <Text style={styles.signOutText}>Logout</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.pressed,
                isDeleting && styles.disabledButton,
              ]}
              onPress={confirmDeleteAccount}
              disabled={isDeleting}
            >
              <Ionicons name="trash-outline" size={20} color={COLORS.warning} />
              <Text style={styles.deleteText}>
                {isDeleting ? "Deleting..." : "Delete Account"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        <BottomSheetModal
          ref={settingsBottomSheetModalRef}
          index={0}
          snapPoints={settingsSnapPoints}
          enableDismissOnClose
          enablePanDownToClose
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandle}
        >
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.bottomSheetContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <SettingsSection
              ref={settingsRef}
              onRequestCamera={handleRequestCamera}
              onProfileSaved={(profile) => {
                const nextName =
                  profile.full_name.trim() ||
                  profile.display_name.trim() ||
                  null;
                setProfileName(nextName);
              }}
            />
          </BottomSheetScrollView>
        </BottomSheetModal>

        <BottomSheetModal
          ref={tipsHistoryBottomSheetModalRef}
          index={1}
          snapPoints={tipHistorySnapPoints}
          enablePanDownToClose
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandle}
        >
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.bottomSheetContent,
              styles.tipHistoryContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <Text style={styles.tipHistoryTitle}>Tip History</Text>
            <Text style={styles.tipHistorySubtitle}>
              Browse the latest plant tips from previous days.
            </Text>

            {isTipHistoryLoading ? (
              <View style={styles.tipHistoryStateContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.tipHistoryStateText}>Loading tips...</Text>
              </View>
            ) : null}

            {!isTipHistoryLoading && !!tipHistoryError ? (
              <View style={styles.tipHistoryStateCard}>
                <Text style={styles.tipHistoryStateTitle}>
                  Could not load tips
                </Text>
                <Text style={styles.tipHistoryStateText}>
                  {tipHistoryError}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.tipHistoryRetryButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    void loadTipHistory();
                  }}
                >
                  <Text style={styles.tipHistoryRetryText}>Try Again</Text>
                </Pressable>
              </View>
            ) : null}

            {!isTipHistoryLoading &&
            !tipHistoryError &&
            tipHistoryRows.length === 0 ? (
              <View style={styles.tipHistoryStateCard}>
                <Text style={styles.tipHistoryStateTitle}>No tips yet</Text>
                <Text style={styles.tipHistoryStateText}>
                  Daily tips will appear here as they unlock.
                </Text>
              </View>
            ) : null}

            {!isTipHistoryLoading && !tipHistoryError
              ? tipHistoryRows.map((tip) => {
                  const isToday = tip.tip_date === todayKey;

                  return (
                    <View key={tip.id} style={styles.tipHistoryCard}>
                      <View style={styles.tipHistoryCardHeader}>
                        <Text style={styles.tipHistoryCardDate}>
                          {formatTipDate(tip.tip_date)}
                        </Text>
                        {isToday ? (
                          <View style={styles.tipHistoryTodayBadge}>
                            <Text style={styles.tipHistoryTodayBadgeText}>
                              Today
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.tipHistoryCardText}>
                        {tip.tip_text}
                      </Text>
                    </View>
                  );
                })
              : null}
          </BottomSheetScrollView>
        </BottomSheetModal>

        <BottomSheetModal
          ref={achievementsBottomSheetModalRef}
          index={0}
          snapPoints={achievementsSnapPoints}
          enablePanDownToClose
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandle}
        >
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.bottomSheetContent,
              styles.tipHistoryContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <Text style={styles.tipHistoryTitle}>Achievements</Text>
            <Text style={styles.tipHistorySubtitle}>
              Track your unlocked milestones.
            </Text>
            {achievements.length === 0 ? (
              <Text style={styles.cardText}>
                No achievements configured yet.
              </Text>
            ) : (
              <View style={styles.achievementList}>
                {achievements.map((item) => (
                  <View
                    key={item.code}
                    style={[
                      styles.achievementItem,
                      item.earnedAt && styles.achievementItemEarned,
                    ]}
                  >
                    <View style={styles.achievementIconWrap}>
                      {ACHIEVEMENT_IMAGE_BY_CODE[item.code] ? (
                        <>
                          <Image
                            source={ACHIEVEMENT_IMAGE_BY_CODE[item.code]}
                            style={[
                              styles.achievementImage,
                              !item.earnedAt &&
                                !item.unlocked &&
                                styles.achievementImageLocked,
                            ]}
                          />
                          {!item.earnedAt && !item.unlocked ? (
                            <View style={styles.achievementImageOverlay} />
                          ) : null}
                        </>
                      ) : (
                        <Ionicons
                          name={item.earnedAt ? "trophy" : "trophy-outline"}
                          size={18}
                          color={
                            !item.earnedAt && !item.unlocked
                              ? "#111111"
                              : item.earnedAt
                                ? COLORS.primary
                                : COLORS.secondary
                          }
                        />
                      )}
                    </View>
                    <View style={styles.achievementTextWrap}>
                      <Text style={styles.achievementTitle}>{item.title}</Text>
                      <Text style={styles.achievementDesc}>
                        {item.description}
                      </Text>
                    </View>
                    <View style={styles.achievementRight}>
                      <Text style={styles.achievementPoints}>
                        +{item.points}
                      </Text>
                      <Text style={styles.achievementBadge}>
                        {item.earnedAt
                          ? "Earned"
                          : item.unlocked
                            ? "Ready"
                            : "Locked"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>

        {isCameraOpen && (
          <View style={styles.cameraOverlay}>
            <CameraCapture
              onCapture={handleCameraCapture}
              onClose={handleCameraClose}
            />
          </View>
        )}
      </View>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: -1,
  },
  blob: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    opacity: 0.1,
  },
  blob1: {
    backgroundColor: COLORS.primary,
    top: -width * 0.2,
    right: -width * 0.2,
  },
  blob2: {
    backgroundColor: COLORS.accent,
    bottom: -width * 0.1,
    left: -width * 0.3,
  },
  content: {
    paddingHorizontal: 24,
    gap: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  greeting: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  userName: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
    textTransform: "capitalize",
  },
  settingsIconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    overflow: "hidden",
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.accent + "40",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  statValue: {
    color: COLORS.primary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 8,
  },
  statLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  mainCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 12,
  },
  cardText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 22,
    opacity: 0.9,
    marginBottom: 20,
  },
  cardButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },
  cardButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  questTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 6,
  },
  questRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  questProgress: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  questPoints: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  questStatus: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  achievementList: {
    gap: 10,
  },
  achievementItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.background + "88",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  achievementItemEarned: {
    borderColor: COLORS.primary + "40",
    backgroundColor: COLORS.primary + "12",
  },
  achievementIconWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  achievementImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  achievementImageLocked: {
    opacity: 0.35,
  },
  achievementImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000066",
    borderRadius: 6,
  },
  achievementTextWrap: {
    flex: 1,
    gap: 2,
  },
  achievementTitle: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  achievementDesc: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  achievementRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  achievementPoints: {
    color: COLORS.secondary,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  achievementBadge: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.75,
  },
  footer: {
    marginTop: 4,
    alignItems: "center",
    gap: 10,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  onboardingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.accent + "55",
  },
  onboardingText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  signOutText: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + "55",
    backgroundColor: COLORS.warning + "22",
  },
  deleteText: {
    color: COLORS.warning,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  bottomSheetBackground: {
    backgroundColor: COLORS.background,
  },
  bottomSheetHandle: {
    backgroundColor: COLORS.secondary + "AA",
  },
  bottomSheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  tipHistoryContent: {
    gap: 12,
  },
  tipHistoryTitle: {
    color: COLORS.primary,
    fontSize: 28,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistorySubtitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.75,
    marginBottom: 6,
  },
  tipHistoryStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 10,
  },
  tipHistoryStateCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.secondary + "25",
    backgroundColor: COLORS.accent + "4A",
    gap: 8,
  },
  tipHistoryStateTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryStateText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  tipHistoryRetryButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
  },
  tipHistoryRetryText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
    backgroundColor: COLORS.accent + "60",
    gap: 8,
  },
  tipHistoryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tipHistoryCardDate: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryTodayBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.primary + "44",
    backgroundColor: COLORS.primary + "16",
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  tipHistoryTodayBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryCardText: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.94,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
});
