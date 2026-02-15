import type { SupabaseClient } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { normalizeWaterDays, parseWaterTimeToMinutes } from "@/lib/wateringSchedule";

export const WATERING_REMINDER_CHANNEL_ID = "watering-reminders";
const WATERING_REMINDER_TYPE = "watering_reminder_v1";

export type WateringReminderPermissionState =
  | Notifications.PermissionStatus
  | "unavailable";

export type WateringReminderPlant = {
  id: string;
  name: string;
  quantity: number;
  water_days: number[] | null;
  water_time: string | null;
};

type ScheduledRequest = {
  identifier: string;
  content?: { data?: unknown } | null;
};

function takeOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isWateringReminderRequest(request: ScheduledRequest): boolean {
  const data = (request.content?.data ?? null) as any;
  return data?.type === WATERING_REMINDER_TYPE;
}

export async function ensureWateringNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    await Notifications.setNotificationChannelAsync(
      WATERING_REMINDER_CHANNEL_ID,
      {
        name: "Watering reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      },
    );
  } catch {
    // Best-effort: don't block app flows if channel creation fails.
  }
}

export async function getWateringNotificationPermissionStateAsync(): Promise<WateringReminderPermissionState> {
  if (Platform.OS === "web") return "unavailable";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return "unavailable";
  }
}

export async function requestWateringNotificationPermissionAsync(): Promise<WateringReminderPermissionState> {
  if (Platform.OS === "web") return "unavailable";
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status;
  } catch {
    return "unavailable";
  }
}

export async function cancelWateringRemindersAsync(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()) as
      | ScheduledRequest[]
      | null
      | undefined;

    const ours = (scheduled ?? []).filter(isWateringReminderRequest);
    await Promise.all(
      ours.map((req) =>
        Notifications.cancelScheduledNotificationAsync(req.identifier),
      ),
    );
  } catch {
    // Best-effort: cancellation failures shouldn't break the app.
  }
}

function buildReminderBody(
  plants: { name: string; quantity: number }[],
): string {
  if (plants.length === 0) return "Your plants are ready for watering.";

  const maxNames = 4;
  const shown = plants.slice(0, maxNames).map((plant) =>
    plant.quantity > 1 ? `${plant.name} x${plant.quantity}` : plant.name,
  );
  const remaining = plants.length - shown.length;
  const suffix = remaining > 0 ? ` +${remaining} more` : "";

  return `Water: ${shown.join(", ")}${suffix}`;
}

export async function syncWateringRemindersAsync(
  plants: WateringReminderPlant[],
): Promise<void> {
  if (Platform.OS === "web") return;

  const permission = await getWateringNotificationPermissionStateAsync();
  if (permission !== "granted") return;

  await ensureWateringNotificationChannelAsync();
  await cancelWateringRemindersAsync();

  type Group = {
    weekday0: number; // 0=Sun..6=Sat (matches DB)
    minutes: number;
    plants: { name: string; quantity: number }[];
    totalQuantity: number;
  };

  const groups = new Map<string, Group>();

  for (const plant of plants) {
    const days = normalizeWaterDays(plant.water_days);
    const minutes = parseWaterTimeToMinutes(plant.water_time);
    if (!days.length || minutes == null) continue;

    for (const weekday0 of days) {
      const key = `${weekday0}:${minutes}`;
      const group =
        groups.get(key) ??
        ({
          weekday0,
          minutes,
          plants: [],
          totalQuantity: 0,
        } satisfies Group);

      group.plants.push({ name: plant.name, quantity: plant.quantity });
      group.totalQuantity += plant.quantity;
      groups.set(key, group);
    }
  }

  // iOS has limits on scheduled notifications; grouping by weekday+time avoids 1 notification per plant.
  const groupList = Array.from(groups.values()).sort((a, b) => {
    if (a.weekday0 !== b.weekday0) return a.weekday0 - b.weekday0;
    return a.minutes - b.minutes;
  });

  await Promise.all(
    groupList.map(async (group) => {
      const hour = Math.floor(group.minutes / 60);
      const minute = group.minutes % 60;
      const weekday = group.weekday0 + 1; // expo: 1=Sun..7=Sat

      const title =
        group.totalQuantity === 1
          ? "Time to water your plant"
          : `Time to water ${group.totalQuantity} plants`;

      const body = buildReminderBody(group.plants);

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: {
              type: WATERING_REMINDER_TYPE,
              kind: "watering",
              route: "/(protected)/(tabs)",
            },
            sound: true,
            ...(Platform.OS === "android"
              ? { channelId: WATERING_REMINDER_CHANNEL_ID }
              : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
          },
        });
      } catch {
        // Best-effort: one failed schedule shouldn't prevent others.
      }
    }),
  );
}

type UserPlantReminderRow = {
  id: string;
  quantity: number;
  custom_name: string | null;
  water_days: number[] | null;
  water_time: string | null;
  plant:
    | { common_name: string | null }
    | { common_name: string | null }[]
    | null;
};

export async function syncWateringRemindersForUserAsync(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!userId) return;

  const { data, error } = await supabase
    .from("user_plants")
    .select(
      "id, quantity, custom_name, water_days, water_time, plant:plants(common_name)",
    )
    .eq("user_id", userId);

  if (error) return;

  const rows = (data ?? []) as unknown as UserPlantReminderRow[];
  const plants: WateringReminderPlant[] = rows.map((row) => {
    const plantRow = takeOne(row.plant);
    const name = row.custom_name?.trim() || plantRow?.common_name || "Plant";

    return {
      id: row.id,
      name,
      quantity: row.quantity ?? 1,
      water_days: row.water_days,
      water_time: row.water_time,
    };
  });

  await syncWateringRemindersAsync(plants);
}
