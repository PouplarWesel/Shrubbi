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
import { LinearGradient } from "expo-linear-gradient";

import { CameraCapture } from "@/components/CameraCapture";
import { SettingsSection } from "@/components/Settings";
import type { SettingsSectionHandle } from "@/components/Settings";
import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import { WATERING_POINTS_PER_PLANT } from "@/lib/plantPoints";
import {
  getWateringNotificationPermissionStateAsync,
  requestWateringNotificationPermissionAsync,
  syncWateringRemindersForUserAsync,
  type WateringReminderPermissionState,
} from "@/lib/wateringNotifications";
import {
  formatWaterTime,
  getLatestScheduledAt,
  isDueToWaterNow,
  normalizeWaterDays,
  parseWaterTimeToMinutes,
} from "@/lib/wateringSchedule";

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
  community_ledger: require("@/assets/achievments/community.webp"),
  plant_parcut: require("@/assets/achievments/plant_Parent.webp"),
  native_protector: require("@/assets/achievments/native_protector.webp"),
  so_thirsty: require("@/assets/achievments/so_thiursty.webp"),
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
  id: string;
  custom_name: string | null;
  quantity: number;
  co2_kg_per_year_override: number | null;
  water_days: number[] | null;
  water_time: string | null;
  last_watered_at: string | null;
  watering_points: number | null;
  plant:
    | {
        common_name: string | null;
        is_native: boolean;
        default_co2_kg_per_year: number;
      }
    | {
        common_name: string | null;
        is_native: boolean;
        default_co2_kg_per_year: number;
      }[]
    | null;
};

type WateringTask = {
  id: string;
  name: string;
  quantity: number;
  water_days: number[] | null;
  water_time: string | null;
  last_watered_at: string | null;
  watering_points: number | null;
  scheduledAt: Date;
  isOverdue: boolean;
};

type WateringPermissionUiState = WateringReminderPermissionState | "unknown";

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
  const [co2CapturedKgPerYear, setCo2CapturedKgPerYear] = useState(0);
  const [wateringDueTasks, setWateringDueTasks] = useState<WateringTask[]>([]);
  const [wateringUpcomingTasks, setWateringUpcomingTasks] = useState<
    WateringTask[]
  >([]);
  const [wateringPermission, setWateringPermission] =
    useState<WateringPermissionUiState>("unknown");
  const [wateringMarkingId, setWateringMarkingId] = useState<string | null>(
    null,
  );
  const [dailyQuest, setDailyQuest] = useState<DailyQuestCard | null>(null);
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const settingsBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const tipsHistoryBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const achievementsBottomSheetModalRef = useRef<BottomSheetModal>(null);
  const settingsSnapPoints = useMemo(() => ["72%", "92%"], []);
  const tipHistorySnapPoints = useMemo(() => ["88%", "94%"], []);
  const achievementsSnapPoints = useMemo(() => ["72%", "90%"], []);
  const bottomSheetTopInset = insets.top + 12;

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
    let isCancelled = false;

    const loadWateringPermission = async () => {
      const status = await getWateringNotificationPermissionStateAsync();
      if (isCancelled) return;
      setWateringPermission(status);

      // If the user granted notifications during onboarding, we still need to schedule reminders.
      if (status === "granted" && userId) {
        void syncWateringRemindersForUserAsync(supabase, userId);
      }
    };

    void loadWateringPermission();

    return () => {
      isCancelled = true;
    };
  }, [supabase, userId]);

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
        setCo2CapturedKgPerYear(0);
        setWateringDueTasks([]);
        setWateringUpcomingTasks([]);
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
            "id, custom_name, quantity, co2_kg_per_year_override, water_days, water_time, last_watered_at, watering_points, plant:plants(common_name, is_native, default_co2_kg_per_year)",
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
        setCo2CapturedKgPerYear(0);
        setWateringDueTasks([]);
        setWateringUpcomingTasks([]);
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
      const nextDueTasks: WateringTask[] = [];
      const nextUpcomingTasks: WateringTask[] = [];

      for (const row of rows) {
        const quantity = row.quantity ?? 0;
        nextPlantTotal += quantity;
        wateredPointsTotal += row.watering_points ?? 0;

        const plantInfo = takeOne(row.plant);
        const displayName =
          row.custom_name?.trim() || plantInfo?.common_name || "Plant";
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

        const isDue = isDueToWaterNow(
          row.water_days,
          row.water_time,
          row.last_watered_at,
          now,
        );

        if (isDue) {
          nextToWaterTotal += quantity;

          const scheduledAt = getLatestScheduledAt(
            row.water_days,
            row.water_time,
            now,
          );
          if (scheduledAt) {
            nextDueTasks.push({
              id: row.id,
              name: displayName,
              quantity,
              water_days: row.water_days,
              water_time: row.water_time,
              last_watered_at: row.last_watered_at,
              watering_points: row.watering_points,
              scheduledAt,
              isOverdue: formatLocalDate(scheduledAt) !== today,
            });
          }
        } else {
          const normalizedDays = normalizeWaterDays(row.water_days);
          const minutesScheduled = parseWaterTimeToMinutes(row.water_time);

          if (
            normalizedDays.includes(now.getDay()) &&
            minutesScheduled != null &&
            minutesScheduled >= 0 &&
            minutesScheduled < 24 * 60
          ) {
            const scheduledAtToday = new Date(now);
            scheduledAtToday.setHours(0, 0, 0, 0);
            scheduledAtToday.setHours(
              Math.floor(minutesScheduled / 60),
              minutesScheduled % 60,
              0,
              0,
            );

            if (scheduledAtToday.getTime() > now.getTime()) {
              nextUpcomingTasks.push({
                id: row.id,
                name: displayName,
                quantity,
                water_days: row.water_days,
                water_time: row.water_time,
                last_watered_at: row.last_watered_at,
                watering_points: row.watering_points,
                scheduledAt: scheduledAtToday,
                isOverdue: false,
              });
            }
          }
        }
      }

      setPlantTotal(nextPlantTotal);
      setToWaterTotal(nextToWaterTotal);
      setCo2CapturedKgPerYear(carbonPerYearKg);
      setWateringDueTasks(
        nextDueTasks.sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
        ),
      );
      setWateringUpcomingTasks(
        nextUpcomingTasks.sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
        ),
      );

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

  const openPlantDetail = (id: string) => {
    router.push({ pathname: "/(protected)/plant/[id]", params: { id } });
  };

  const formatTaskWhenLabel = (task: WateringTask) => {
    const now = new Date();
    const isToday = formatLocalDate(task.scheduledAt) === formatLocalDate(now);
    const timeLabel = formatWaterTime(task.water_time);

    if (task.isOverdue) {
      const weekday = task.scheduledAt.toLocaleDateString(undefined, {
        weekday: "short",
      });
      return `Overdue since ${weekday} ${timeLabel}`;
    }

    return task.scheduledAt.getTime() <= now.getTime() && isToday
      ? `Due since ${timeLabel}`
      : `Today at ${timeLabel}`;
  };

  const handleEnableWateringReminders = async () => {
    const status = await requestWateringNotificationPermissionAsync();
    setWateringPermission(status);

    if (status === "granted" && userId) {
      await syncWateringRemindersForUserAsync(supabase, userId);
      return;
    }

    if (status === "denied") {
      Alert.alert(
        "Notifications disabled",
        "Enable notifications in your device settings to get watering reminders.",
      );
    }
  };

  const handleMarkWatered = async (task: WateringTask) => {
    if (!isLoaded || !userId || wateringMarkingId) return;

    const latestScheduleForMark = getLatestScheduledAt(
      task.water_days,
      task.water_time,
    );
    const canMarkNow =
      !!latestScheduleForMark &&
      (!task.last_watered_at ||
        new Date(task.last_watered_at).getTime() <
          latestScheduleForMark.getTime());

    if (!canMarkNow) {
      Alert.alert(
        "Not due yet",
        "This plant is not due for watering yet. You can adjust its schedule on the plant page.",
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const nextWateringPoints =
      (task.watering_points ?? 0) + task.quantity * WATERING_POINTS_PER_PLANT;

    setWateringMarkingId(task.id);
    const { error } = await supabase
      .from("user_plants")
      .update({
        last_watered_at: nowIso,
        watering_points: nextWateringPoints,
      })
      .eq("id", task.id)
      .eq("user_id", userId);
    setWateringMarkingId(null);

    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }

    void loadPlantStats(true);
  };

  const todayKey = formatLocalDate(new Date());
  const userEmail = session?.user?.email || "Gardener";
  const fallbackName = userEmail.split("@")[0];
  const userName = profileName || fallbackName;
  const co2CapturedDisplay = Math.round(co2CapturedKgPerYear).toLocaleString();

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
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Good day,</Text>
              <Text style={styles.userName}>{userName}!</Text>
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
                  name="trophy"
                  size={20}
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
                  name="settings"
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accent + "90", COLORS.accent + "40"]}
                style={styles.cardGradient}
              >
                <View style={styles.statIconContainer}>
                  <Ionicons name="leaf" size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.statValue}>{plantTotal}</Text>
                <Text style={styles.statLabel}>Plants</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accent + "90", COLORS.accent + "40"]}
                style={styles.cardGradient}
              >
                <View style={[styles.statIconContainer, { backgroundColor: COLORS.secondary + "20" }]}>
                  <Ionicons name="water" size={20} color={COLORS.secondary} />
                </View>
                <Text style={[styles.statValue, { color: COLORS.secondary }]}>{toWaterTotal}</Text>
                <Text style={styles.statLabel}>Need Water</Text>
              </LinearGradient>
            </View>
          </View>
          <View style={[styles.statCard, styles.co2StatCard]}>
            <LinearGradient
              colors={[COLORS.accent + "90", COLORS.accent + "40"]}
              style={styles.cardGradient}
            >
              <View
                style={[
                  styles.statIconContainer,
                  { backgroundColor: COLORS.primary + "24" },
                ]}
              >
                <Ionicons name="cloud-done" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.statValue}>{co2CapturedDisplay}</Text>
              <Text style={styles.statLabel}>CO2 Captured (kg/year)</Text>
            </LinearGradient>
          </View>

          <View style={styles.wateringContainer}>
            <View style={styles.wateringHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                Watering
              </Text>
              <Pressable
                onPress={() => router.push("/(protected)/(tabs)/plants")}
                style={({ pressed }) => [
                  styles.wateringManageButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.wateringManageText}>Manage</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>

            <View style={styles.wateringCard}>
              <View style={styles.wateringRemindersRow}>
                <View style={styles.wateringRemindersLeft}>
                  <View style={styles.wateringRemindersIcon}>
                    <Ionicons
                      name="notifications"
                      size={18}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.wateringRemindersText}>
                    <Text style={styles.wateringRemindersTitle}>Reminders</Text>
                    <Text style={styles.wateringRemindersSubtitle}>
                      {wateringPermission === "granted"
                        ? "On"
                        : wateringPermission === "denied"
                          ? "Off"
                          : wateringPermission === "undetermined"
                            ? "Not enabled"
                            : wateringPermission === "unavailable"
                              ? "Unavailable on web"
                              : "Checking..."}
                    </Text>
                  </View>
                </View>
                {wateringPermission !== "granted" &&
                wateringPermission !== "unavailable" ? (
                  <Pressable
                    onPress={() => void handleEnableWateringReminders()}
                    style={({ pressed }) => [
                      styles.wateringRemindersButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <LinearGradient
                      colors={[COLORS.primary, COLORS.secondary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.wateringRemindersButtonGradient}
                    >
                      <Text style={styles.wateringRemindersButtonText}>
                        Enable
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ) : null}
              </View>

              {wateringDueTasks.length === 0 &&
              wateringUpcomingTasks.length === 0 ? (
                <View style={styles.wateringEmpty}>
                  <Ionicons
                    name="water-outline"
                    size={22}
                    color={COLORS.secondary}
                  />
                  <Text style={styles.wateringEmptyTitle}>
                    No watering scheduled
                  </Text>
                  <Text style={styles.wateringEmptyText}>
                    Set watering days and a time for each plant to get reminders
                    and show tasks here.
                  </Text>
                  <Pressable
                    onPress={() => router.push("/(protected)/(tabs)/plants")}
                    style={({ pressed }) => [
                      styles.wateringEmptyButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.wateringEmptyButtonText}>
                      Go to Plants
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.wateringList}>
                  {wateringDueTasks.length > 0 ? (
                    <>
                      <Text style={styles.wateringSubheading}>Due now</Text>
                      {wateringDueTasks.map((task) => {
                        const points =
                          task.quantity * WATERING_POINTS_PER_PLANT;
                        const isMarking = wateringMarkingId === task.id;

                        return (
                          <View key={task.id} style={styles.wateringTaskRow}>
                            <View style={styles.wateringTaskIcon}>
                              <Ionicons
                                name={
                                  task.isOverdue ? "alert-circle" : "water"
                                }
                                size={18}
                                color={
                                  task.isOverdue
                                    ? COLORS.warning
                                    : COLORS.secondary
                                }
                              />
                            </View>
                            <View style={styles.wateringTaskInfo}>
                              <Text
                                style={styles.wateringTaskName}
                                numberOfLines={1}
                              >
                                {task.name}
                              </Text>
                              <View style={styles.wateringTaskMetaColumn}>
                                <Text style={styles.wateringTaskMeta}>
                                  {formatTaskWhenLabel(task)}
                                </Text>
                                <Text style={styles.wateringTaskMetaPoints}>
                                  +{points} pts
                                </Text>
                              </View>
                            </View>
                            <View style={styles.wateringTaskRight}>
                              <View style={styles.wateringQtyBadge}>
                                <Text style={styles.wateringQtyText}>
                                  x{task.quantity}
                                </Text>
                              </View>
                              <Pressable
                                onPress={() => void handleMarkWatered(task)}
                                disabled={isMarking}
                                style={({ pressed }) => [
                                  styles.wateringDoneButton,
                                  pressed && styles.pressed,
                                  isMarking && styles.disabledButton,
                                ]}
                              >
                                <Text style={styles.wateringDoneButtonText}>
                                  {isMarking ? "Saving..." : "Watered"}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => openPlantDetail(task.id)}
                                style={({ pressed }) => [
                                  styles.wateringDetailsButton,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Ionicons
                                  name="chevron-forward"
                                  size={18}
                                  color={COLORS.primary}
                                />
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  ) : null}

                  {wateringUpcomingTasks.length > 0 ? (
                    <>
                      <Text style={styles.wateringSubheading}>Later today</Text>
                      {wateringUpcomingTasks.map((task) => (
                        <View key={task.id} style={styles.wateringTaskRow}>
                          <View style={styles.wateringTaskIcon}>
                            <Ionicons
                              name="time"
                              size={18}
                              color={COLORS.secondary}
                            />
                          </View>
                          <View style={styles.wateringTaskInfo}>
                            <Text
                              style={styles.wateringTaskName}
                              numberOfLines={1}
                            >
                              {task.name}
                            </Text>
                            <Text style={styles.wateringTaskMeta}>
                              {formatTaskWhenLabel(task)}
                            </Text>
                          </View>
                          <View style={styles.wateringTaskRight}>
                            <View style={styles.wateringQtyBadge}>
                              <Text style={styles.wateringQtyText}>
                                x{task.quantity}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => openPlantDetail(task.id)}
                              style={({ pressed }) => [
                                styles.wateringDetailsButton,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={COLORS.primary}
                              />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : null}
                </View>
              )}
            </View>
          </View>

          <View style={styles.featuredContainer}>
            <Text style={styles.sectionTitle}>Today's Tip</Text>
            <Pressable onPress={handleOpenTipsHistory}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tipCard}
              >
                <View style={styles.tipHeader}>
                  <Ionicons name="sparkles" size={18} color={COLORS.background} />
                  <Text style={styles.tipTitle}>Green Insights</Text>
                </View>
                <Text style={styles.tipText}>
                  {isDailyTipLoading ? "Nurturing a new tip..." : dailyTipText}
                </Text>
                <View style={styles.tipFooter}>
                  <Text style={styles.tipActionText}>View previous tips</Text>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.background} />
                </View>
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.questContainer}>
            <Text style={styles.sectionTitle}>Daily Quest</Text>
            {dailyQuest ? (
              <View style={styles.questCard}>
                <View style={styles.questInfo}>
                  <View style={styles.questHeader}>
                    <Text style={styles.questCardTitle}>{dailyQuest.title}</Text>
                    <View style={styles.pointsBadge}>
                      <Text style={styles.pointsBadgeText}>+{dailyQuest.points} pts</Text>
                    </View>
                  </View>
                  <Text style={styles.questDescription}>{dailyQuest.description}</Text>
                </View>
                
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBackground}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { width: `${Math.min((dailyQuest.progress / dailyQuest.target) * 100, 100)}%` }
                      ]} 
                    />
                  </View>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressText}>
                      {dailyQuest.progress} of {dailyQuest.target} goals
                    </Text>
                    {dailyQuest.completed && (
                      <View style={styles.completedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                        <Text style={styles.completedBadgeText}>Done</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyQuestCard}>
                <Text style={styles.emptyQuestText}>No active quests right now. Take a break!</Text>
              </View>
            )}
          </View>

          <View style={styles.quickActions}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/(protected)/onboarding")}
            >
              <Ionicons name="help-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.actionButtonText}>Help</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.text} />
              <Text style={[styles.actionButtonText, { color: COLORS.text }]}>Logout</Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.dangerButton,
              pressed && styles.pressed,
              isDeleting && styles.disabledButton,
            ]}
            onPress={confirmDeleteAccount}
            disabled={isDeleting}
          >
            <Text style={styles.dangerButtonText}>
              {isDeleting ? "Deleting..." : "Delete Account"}
            </Text>
          </Pressable>
        </ScrollView>

        <BottomSheetModal
          ref={settingsBottomSheetModalRef}
          index={0}
          snapPoints={settingsSnapPoints}
          topInset={bottomSheetTopInset}
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
          topInset={bottomSheetTopInset}
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
          topInset={bottomSheetTopInset}
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
    width: width * 1.0,
    height: width * 1.0,
    borderRadius: width * 0.5,
    opacity: 0.15,
  },
  blob1: {
    backgroundColor: COLORS.primary,
    top: -width * 0.3,
    right: -width * 0.4,
  },
  blob2: {
    backgroundColor: COLORS.accent,
    bottom: -width * 0.2,
    left: -width * 0.5,
  },
  content: {
    paddingHorizontal: 24,
    gap: 28,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  userName: {
    color: COLORS.primary,
    fontSize: 42,
    fontFamily: "Boogaloo_400Regular",
    textTransform: "capitalize",
    lineHeight: 46,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  settingsIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent + "80",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 16,
  },
  statCard: {
    flex: 1,
    height: 140,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  co2StatCard: {
    marginTop: 16,
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
  },
  statLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
    textAlign: "center",
  },
  sectionTitle: {
    color: COLORS.secondary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 12,
    marginLeft: 4,
  },
  wateringContainer: {
    marginTop: 4,
  },
  wateringHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  wateringManageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.accent + "40",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  wateringManageText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  wateringCard: {
    backgroundColor: COLORS.accent + "30",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    gap: 14,
  },
  wateringRemindersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  wateringRemindersLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wateringRemindersIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.primary + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  wateringRemindersText: {
    gap: 2,
  },
  wateringRemindersTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringRemindersSubtitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  wateringRemindersButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  wateringRemindersButtonGradient: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  wateringRemindersButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringEmpty: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  wateringEmptyTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringEmptyText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.65,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  wateringEmptyButton: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
  },
  wateringEmptyButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringList: {
    gap: 10,
  },
  wateringSubheading: {
    color: COLORS.secondary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 8,
    marginBottom: 2,
  },
  wateringTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.background + "70",
    borderWidth: 1,
    borderColor: COLORS.secondary + "18",
  },
  wateringTaskIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: COLORS.secondary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  wateringTaskInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  wateringTaskName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringTaskMeta: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  wateringTaskMetaColumn: {
    flexDirection: "column",
    gap: 4,
  },
  wateringTaskMetaPoints: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  wateringTaskRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wateringQtyBadge: {
    backgroundColor: COLORS.secondary + "16",
    borderWidth: 1,
    borderColor: COLORS.secondary + "24",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wateringQtyText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringDoneButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  wateringDoneButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  wateringDetailsButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: COLORS.accent + "50",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredContainer: {
    marginTop: 4,
  },
  tipCard: {
    borderRadius: 32,
    padding: 24,
    gap: 12,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tipTitle: {
    color: COLORS.background,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  tipText: {
    color: COLORS.background,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 24,
  },
  tipFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
  },
  tipActionText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  questContainer: {
    marginTop: 4,
  },
  questCard: {
    backgroundColor: COLORS.accent + "50",
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
    gap: 16,
  },
  questInfo: {
    gap: 8,
  },
  questHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  questCardTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
  },
  pointsBadge: {
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pointsBadgeText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  questDescription: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.8,
  },
  progressContainer: {
    gap: 8,
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: COLORS.background + "80",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 5,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  completedBadgeText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  emptyQuestCard: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent + "20",
    borderRadius: 28,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
  },
  emptyQuestText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    opacity: 0.5,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.accent + "40",
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  actionButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  dangerButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  dangerButtonText: {
    color: COLORS.warning,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  bottomSheetBackground: {
    backgroundColor: COLORS.background,
  },
  bottomSheetHandle: {
    backgroundColor: COLORS.secondary + "AA",
  },
  bottomSheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  tipHistoryContent: {
    gap: 12,
  },
  tipHistoryTitle: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistorySubtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
    marginBottom: 8,
  },
  cardText: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  tipHistoryStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  tipHistoryStateText: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.6,
  },
  tipHistoryStateCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    backgroundColor: COLORS.accent + "30",
    gap: 10,
  },
  tipHistoryStateTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryRetryButton: {
    alignSelf: "flex-start",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    marginTop: 8,
  },
  tipHistoryRetryText: {
    color: COLORS.background,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "15",
    backgroundColor: COLORS.accent + "40",
    gap: 10,
  },
  tipHistoryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tipHistoryCardDate: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryTodayBadge: {
    borderRadius: 12,
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tipHistoryTodayBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  tipHistoryCardText: {
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.9,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  achievementList: {
    gap: 12,
  },
  achievementItem: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    backgroundColor: COLORS.accent + "20",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  achievementItemEarned: {
    borderColor: COLORS.primary + "40",
    backgroundColor: COLORS.primary + "10",
  },
  achievementIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  achievementImage: {
    width: "100%",
    height: "100%",
  },
  achievementImageLocked: {
    opacity: 0.2,
    tintColor: "#000",
  },
  achievementImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  achievementTextWrap: {
    flex: 1,
    gap: 2,
  },
  achievementTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  achievementDesc: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.7,
  },
  achievementRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  achievementPoints: {
    color: COLORS.secondary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  achievementBadge: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    opacity: 0.5,
  },
});
