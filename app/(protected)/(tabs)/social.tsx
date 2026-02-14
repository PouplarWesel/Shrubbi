import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
  KeyboardAvoidingView,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import "react-native-image-keyboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import type { Json } from "@/supabase/database.types";

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  city_id: string;
};

type ChatChannelRow = {
  id: string;
  city_id: string;
  team_id: string | null;
  display_name: string;
  scope: "city" | "team";
};

type ChatThreadRow = {
  id: string;
  title: string | null;
  channel_id: string;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

type ChatMessageRow = {
  id: string;
  channel_id: string;
  thread_id: string | null;
  sender_id: string;
  reply_to_message_id: string | null;
  kind: "text" | "image" | "gif" | "system";
  body: string | null;
  metadata: Json;
  created_at: string;
  deleted_at: string | null;
};

type ChatAttachmentRow = {
  id: string;
  message_id: string;
  kind: "image" | "gif" | "file";
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
};

type ChatReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type PublicProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type EventAttendanceStatus = "going" | "waitlist" | "cancelled";

type EventRow = {
  id: string;
  city_id: string;
  created_by: string;
  title: string;
  description: string | null;
  activity_type: string;
  location_name: string;
  location_address: string | null;
  location_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  starts_at: string;
  ends_at: string;
  sign_up_deadline: string | null;
  max_attendees: number | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type EventAttendeeRow = {
  event_id: string;
  user_id: string;
  status: EventAttendanceStatus;
  note: string | null;
  signed_up_at: string;
  created_at: string;
  updated_at: string;
};

type EventAttendeeCounts = {
  cancelled: number;
  going: number;
  waitlist: number;
};

type KeyboardImageChangeEvent = {
  nativeEvent: {
    uri: string;
    data: string;
    linkUri?: string | null;
    mime?: string | null;
  };
};

const QUICK_REACTIONS = ["🌱", "🔥", "💧", "👏", "😂"] as const;

const EVENT_DATE_TIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:\s+|T)(\d{2}):(\d{2})$/;

const getFriendlyErrorMessage = (message: string) => {
  if (message.includes("teams_city_name_key")) {
    return "A group with this name already exists in your region.";
  }
  if (message.includes("row-level security")) {
    return "Your account cannot create groups yet. Please contact support.";
  }
  return message;
};

const getFriendlyEventErrorMessage = (message: string) => {
  if (message.includes("event is full")) {
    return "This event is full. Join the waitlist instead.";
  }
  if (message.includes("sign up deadline has passed")) {
    return "Signups are closed for this event.";
  }
  if (message.includes("already started")) {
    return "This event already started.";
  }
  if (message.includes("event city must match user city")) {
    return "You can only join events in your city.";
  }
  return message;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const getFileExtension = (uri: string, mimeType?: string | null) => {
  const mimeExtension = mimeType?.split("/")[1]?.toLowerCase();
  if (mimeExtension) {
    return mimeExtension === "jpeg" ? "jpg" : mimeExtension;
  }

  const uriParts = uri.split(".");
  const fallbackExtension = uriParts[uriParts.length - 1]?.toLowerCase();
  if (fallbackExtension && fallbackExtension.length <= 5) {
    return fallbackExtension;
  }

  return "jpg";
};

const readImageUriAsBlob = async (uri: string) => {
  try {
    const response = await fetch(uri);
    return await response.blob();
  } catch {
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onerror = () =>
        reject(new Error("Could not read image from device."));
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }
};

const base64ToUint8Array = (value: string) => {
  const normalized = value
    .replace(/[\r\n\s]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let index = 0; index < alphabet.length; index += 1) {
    lookup[alphabet.charCodeAt(index)] = index;
  }

  const padding = padded.endsWith("==") ? 2 : padded.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((padded.length * 3) / 4 - padding);

  let pointer = 0;
  for (let index = 0; index < padded.length; index += 4) {
    const char1 = padded.charCodeAt(index);
    const char2 = padded.charCodeAt(index + 1);
    const char3 = padded[index + 2] ?? "=";
    const char4 = padded[index + 3] ?? "=";

    const encoded1 = lookup[char1];
    const encoded2 = lookup[char2];
    const encoded3 = char3 === "=" ? 0 : lookup[char3.charCodeAt(0)];
    const encoded4 = char4 === "=" ? 0 : lookup[char4.charCodeAt(0)];

    const chunk =
      (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;

    if (pointer < bytes.length) {
      bytes[pointer] = (chunk >> 16) & 255;
      pointer += 1;
    }
    if (char3 !== "=" && pointer < bytes.length) {
      bytes[pointer] = (chunk >> 8) & 255;
      pointer += 1;
    }
    if (char4 !== "=" && pointer < bytes.length) {
      bytes[pointer] = chunk & 255;
      pointer += 1;
    }
  }

  return bytes;
};

const getGifUrl = (message: ChatMessageRow) => {
  if (message.kind !== "gif") return null;
  if (typeof message.body === "string" && /^https?:\/\//i.test(message.body)) {
    return message.body;
  }

  if (
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata)
  ) {
    const gifUrl = (message.metadata as { gif_url?: unknown }).gif_url;
    if (typeof gifUrl === "string" && /^https?:\/\//i.test(gifUrl)) {
      return gifUrl;
    }
  }

  return null;
};

const messagePreview = (message: ChatMessageRow | undefined) => {
  if (!message) return "Original message";
  if (message.kind === "gif") return "GIF";
  if (message.kind === "image") return "Image";
  const text = (message.body ?? "").trim();
  if (!text) return "Message";
  return text.length > 64 ? `${text.slice(0, 64)}...` : text;
};

const formatEventWindow = (startsAt: string, endsAt: string) => {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  const sameDay = starts.toDateString() === ends.toDateString();

  if (sameDay) {
    return `${starts.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      weekday: "short",
    })} ${starts.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })} - ${ends.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return `${starts.toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })} - ${ends.toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })}`;
};

const summarizeEventAttendees = (
  rows: EventAttendeeRow[],
): EventAttendeeCounts => {
  const summary: EventAttendeeCounts = {
    cancelled: 0,
    going: 0,
    waitlist: 0,
  };

  for (const row of rows) {
    summary[row.status] += 1;
  }

  return summary;
};

const parseEventDateTime = (value: string): Date | null => {
  const trimmed = value.trim();
  const match = EVENT_DATE_TIME_REGEX.exec(trimmed);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day) ||
    parsed.getHours() !== Number(hour) ||
    parsed.getMinutes() !== Number(minute)
  ) {
    return null;
  }

  return parsed;
};

const toEventDateTimeDraft = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getDate()).padStart(2, "0")} ${String(
    value.getHours(),
  ).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

const makeDefaultEventWindowDrafts = () => {
  const startsAt = new Date();
  startsAt.setMinutes(0, 0, 0);
  startsAt.setHours(startsAt.getHours() + 1);

  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  return {
    endsAtDraft: toEventDateTimeDraft(endsAt),
    startsAtDraft: toEventDateTimeDraft(startsAt),
  };
};

export default function SocialPage() {
  const { session, supabase } = useSupabase();
  const initialEventWindow = useMemo(makeDefaultEventWindowDrafts, []);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkingTeamId, setIsWorkingTeamId] = useState<string | null>(null);
  const [workingEventId, setWorkingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [cityName, setCityName] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [joinedTeamIds, setJoinedTeamIds] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventAttendeesByEvent, setEventAttendeesByEvent] = useState<
    Record<string, EventAttendeeRow[]>
  >({});
  const [eventOrganizersById, setEventOrganizersById] = useState<
    Record<string, PublicProfileRow>
  >({});
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventActivityType, setNewEventActivityType] = useState("community");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventLocationName, setNewEventLocationName] = useState("");
  const [newEventLocationAddress, setNewEventLocationAddress] = useState("");
  const [newEventLocationNotes, setNewEventLocationNotes] = useState("");
  const [newEventStartsAt, setNewEventStartsAt] = useState(
    initialEventWindow.startsAtDraft,
  );
  const [newEventEndsAt, setNewEventEndsAt] = useState(
    initialEventWindow.endsAtDraft,
  );
  const [newEventSignUpDeadline, setNewEventSignUpDeadline] = useState("");
  const [newEventMaxAttendees, setNewEventMaxAttendees] = useState("");
  const [channels, setChannels] = useState<ChatChannelRow[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, ChatAttachmentRow[]>
  >({});
  const [reactionsByMessage, setReactionsByMessage] = useState<
    Record<string, ChatReactionRow[]>
  >({});
  const [profilesById, setProfilesById] = useState<
    Record<string, PublicProfileRow>
  >({});
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<
    Record<string, string>
  >({});
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [isThreadMode, setIsThreadMode] = useState(false);
  const [threadTitleDraft, setThreadTitleDraft] = useState("");
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "events" | "groups">("chat");

  const userId = session?.user?.id ?? null;

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  const messageById = useMemo(() => {
    const next: Record<string, ChatMessageRow> = {};
    for (const message of messages) {
      next[message.id] = message;
    }
    return next;
  }, [messages]);
  const replyToMessage = replyToMessageId
    ? messageById[replyToMessageId]
    : undefined;

  const refreshChatChannels = useCallback(
    async (nextCityId: string | null) => {
      if (!nextCityId) {
        setChannels([]);
        setActiveChannelId(null);
        setActiveThreadId(null);
        return;
      }

      const { data, error } = await supabase
        .from("chat_channels")
        .select("id, city_id, team_id, display_name, scope")
        .eq("city_id", nextCityId)
        .order("scope", { ascending: true })
        .order("display_name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const nextChannels = (data ?? []) as ChatChannelRow[];
      setChannels(nextChannels);
      setActiveChannelId((previous) => {
        if (
          previous &&
          nextChannels.some((channel) => channel.id === previous)
        ) {
          return previous;
        }
        const cityChannel = nextChannels.find(
          (channel) => channel.scope === "city",
        );
        return cityChannel?.id ?? nextChannels[0]?.id ?? null;
      });
    },
    [supabase],
  );

  const loadEventsData = useCallback(
    async (nextCityId: string | null) => {
      if (!nextCityId) {
        setEvents([]);
        setEventAttendeesByEvent({});
        setEventOrganizersById({});
        return;
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from("events")
        .select(
          "id, city_id, created_by, title, description, activity_type, location_name, location_address, location_notes, latitude, longitude, starts_at, ends_at, sign_up_deadline, max_attendees, is_cancelled, cancelled_at, metadata, created_at, updated_at",
        )
        .eq("city_id", nextCityId)
        .order("starts_at", { ascending: true })
        .limit(200);

      if (eventsError) {
        setErrorMessage(eventsError.message);
        return;
      }

      const nextEvents = (eventRows ?? []) as EventRow[];
      setEvents(nextEvents);

      const eventIds = nextEvents.map((event) => event.id);
      const organizerIds = Array.from(
        new Set(nextEvents.map((event) => event.created_by)),
      );

      if (eventIds.length === 0) {
        setEventAttendeesByEvent({});
        setEventOrganizersById({});
        return;
      }

      const [
        { data: attendeeRows, error: attendeeError },
        { data: organizerRows, error: organizerError },
      ] = await Promise.all([
        supabase
          .from("event_attendees")
          .select(
            "event_id, user_id, status, note, signed_up_at, created_at, updated_at",
          )
          .in("event_id", eventIds),
        organizerIds.length > 0
          ? supabase
              .from("public_profiles")
              .select("id, display_name, avatar_url")
              .in("id", organizerIds)
          : Promise.resolve({ data: [] as PublicProfileRow[], error: null }),
      ]);

      if (attendeeError || organizerError) {
        setErrorMessage(
          attendeeError?.message ??
            organizerError?.message ??
            "Could not load event members.",
        );
        return;
      }

      const nextEventAttendeesByEvent = (
        (attendeeRows ?? []) as EventAttendeeRow[]
      ).reduce(
        (acc, row) => {
          if (!acc[row.event_id]) {
            acc[row.event_id] = [];
          }
          acc[row.event_id].push(row);
          return acc;
        },
        {} as Record<string, EventAttendeeRow[]>,
      );

      const nextEventOrganizersById = (
        (organizerRows ?? []) as PublicProfileRow[]
      ).reduce(
        (acc, row) => {
          acc[row.id] = row;
          return acc;
        },
        {} as Record<string, PublicProfileRow>,
      );

      setEventAttendeesByEvent(nextEventAttendeesByEvent);
      setEventOrganizersById(nextEventOrganizersById);
    },
    [supabase],
  );

  const loadSocialData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setErrorMessage("");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("city_id, city")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setErrorMessage("Could not load profile.");
      setIsLoading(false);
      return;
    }

    const currentCityId = profile?.city_id ?? null;
    setCityId(currentCityId);
    setCityName(profile?.city ?? null);

    const [
      { data: membershipsData, error: membershipsError },
      { data: teamsData, error: teamsError },
    ] = await Promise.all([
      supabase.from("team_memberships").select("team_id").eq("user_id", userId),
      currentCityId
        ? supabase
            .from("teams")
            .select("id, name, description, city_id")
            .eq("city_id", currentCityId)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] as TeamRow[], error: null }),
    ]);

    if (membershipsError || teamsError) {
      setErrorMessage(
        membershipsError?.message ??
          teamsError?.message ??
          "Could not load groups.",
      );
    }

    setJoinedTeamIds((membershipsData ?? []).map((row) => row.team_id));
    setTeams((teamsData ?? []) as TeamRow[]);
    await Promise.all([
      refreshChatChannels(currentCityId),
      loadEventsData(currentCityId),
    ]);
    setIsLoading(false);
  }, [loadEventsData, refreshChatChannels, supabase, userId]);

  useEffect(() => {
    void loadSocialData();
  }, [loadSocialData]);

  const loadChatData = useCallback(async () => {
    if (!activeChannelId) {
      setMessages([]);
      setThreads([]);
      setAttachmentsByMessage({});
      setReactionsByMessage({});
      setProfilesById({});
      setSignedAttachmentUrls({});
      return;
    }

    setIsChatLoading(true);
    const [
      { data: messageRows, error: messageError },
      { data: threadRows, error: threadError },
    ] = await Promise.all([
      supabase
        .from("chat_messages")
        .select(
          "id, channel_id, thread_id, sender_id, reply_to_message_id, kind, body, metadata, created_at, deleted_at",
        )
        .eq("channel_id", activeChannelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(250),
      supabase
        .from("chat_threads")
        .select("id, title, channel_id, created_by, created_at, archived_at")
        .eq("channel_id", activeChannelId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    if (messageError || threadError) {
      setErrorMessage(
        messageError?.message ?? threadError?.message ?? "Could not load chat.",
      );
      setIsChatLoading(false);
      return;
    }

    const nextMessages = (messageRows ?? []) as ChatMessageRow[];
    const nextThreads = (threadRows ?? []) as ChatThreadRow[];
    const messageIds = nextMessages.map((message) => message.id);

    let attachmentRows: ChatAttachmentRow[] = [];
    let reactionRows: ChatReactionRow[] = [];

    if (messageIds.length > 0) {
      const [
        { data: attachmentsData, error: attachmentsError },
        { data: reactionsData, error: reactionsError },
      ] = await Promise.all([
        supabase
          .from("chat_message_attachments")
          .select(
            "id, message_id, kind, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, uploaded_by, created_at",
          )
          .in("message_id", messageIds),
        supabase
          .from("chat_message_reactions")
          .select("message_id, user_id, emoji, created_at")
          .in("message_id", messageIds),
      ]);

      if (attachmentsError || reactionsError) {
        setErrorMessage(
          attachmentsError?.message ??
            reactionsError?.message ??
            "Could not load message details.",
        );
      } else {
        attachmentRows = (attachmentsData ?? []) as ChatAttachmentRow[];
        reactionRows = (reactionsData ?? []) as ChatReactionRow[];
      }
    }

    const profileIds = Array.from(
      new Set([
        ...nextMessages.map((message) => message.sender_id),
        ...reactionRows.map((reaction) => reaction.user_id),
        ...nextThreads.map((thread) => thread.created_by),
      ]),
    );

    let nextProfilesById: Record<string, PublicProfileRow> = {};
    if (profileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", profileIds);

      if (profileError) {
        setErrorMessage(profileError.message);
      } else {
        nextProfilesById = ((profileRows ?? []) as PublicProfileRow[]).reduce(
          (acc, row) => {
            acc[row.id] = row;
            return acc;
          },
          {} as Record<string, PublicProfileRow>,
        );
      }
    }

    const nextAttachmentsByMessage = attachmentRows.reduce(
      (acc, attachment) => {
        if (!acc[attachment.message_id]) {
          acc[attachment.message_id] = [];
        }
        acc[attachment.message_id].push(attachment);
        return acc;
      },
      {} as Record<string, ChatAttachmentRow[]>,
    );
    const nextReactionsByMessage = reactionRows.reduce(
      (acc, reaction) => {
        if (!acc[reaction.message_id]) {
          acc[reaction.message_id] = [];
        }
        acc[reaction.message_id].push(reaction);
        return acc;
      },
      {} as Record<string, ChatReactionRow[]>,
    );

    const attachmentPaths = Array.from(
      new Set(
        attachmentRows
          .filter((attachment) => attachment.storage_bucket === "chat-media")
          .map((attachment) => attachment.storage_path),
      ),
    );

    const nextSignedAttachmentUrls: Record<string, string> = {};
    if (attachmentPaths.length > 0) {
      const { data: signedRows, error: signedError } = await supabase.storage
        .from("chat-media")
        .createSignedUrls(attachmentPaths, 3600);

      if (signedError) {
        setErrorMessage(signedError.message);
      } else {
        signedRows.forEach((row, index) => {
          const path = attachmentPaths[index];
          if (path && row?.signedUrl) {
            nextSignedAttachmentUrls[path] = row.signedUrl;
          }
        });
      }
    }

    setMessages(nextMessages);
    setThreads(nextThreads);
    setAttachmentsByMessage(nextAttachmentsByMessage);
    setReactionsByMessage(nextReactionsByMessage);
    setProfilesById(nextProfilesById);
    setSignedAttachmentUrls(nextSignedAttachmentUrls);
    setActiveThreadId((previous) => {
      if (!previous) return null;
      return nextThreads.some((thread) => thread.id === previous)
        ? previous
        : null;
    });
    setIsChatLoading(false);
  }, [activeChannelId, supabase]);

  useEffect(() => {
    void loadChatData();
  }, [loadChatData]);

  useEffect(() => {
    if (!activeChannelId) return;

    const channel = supabase
      .channel(`social-chat-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        () => {
          void loadChatData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_threads",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        () => {
          void loadChatData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeChannelId, loadChatData, supabase]);

  useEffect(() => {
    if (!cityId) return;

    const channel = supabase
      .channel(`social-events-${cityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `city_id=eq.${cityId}`,
        },
        () => {
          void loadEventsData(cityId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_attendees",
        },
        () => {
          void loadEventsData(cityId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cityId, loadEventsData, supabase]);

  const joinedTeams = useMemo(
    () => teams.filter((team) => joinedTeamIds.includes(team.id)),
    [joinedTeamIds, teams],
  );
  const availableTeams = useMemo(
    () => teams.filter((team) => !joinedTeamIds.includes(team.id)),
    [joinedTeamIds, teams],
  );
  const visibleMessages = useMemo(
    () =>
      messages.filter((message) =>
        activeThreadId
          ? message.thread_id === activeThreadId
          : message.thread_id === null,
      ),
    [messages, activeThreadId],
  );
  const threadMessageCount = useMemo(() => {
    const next: Record<string, number> = {};
    for (const message of messages) {
      if (!message.thread_id) continue;
      next[message.thread_id] = (next[message.thread_id] ?? 0) + 1;
    }
    return next;
  }, [messages]);
  const eventAttendeeSummaryByEvent = useMemo(() => {
    const next: Record<string, EventAttendeeCounts> = {};
    for (const [eventId, rows] of Object.entries(eventAttendeesByEvent)) {
      next[eventId] = summarizeEventAttendees(rows);
    }
    return next;
  }, [eventAttendeesByEvent]);
  const myEventAttendanceByEvent = useMemo(() => {
    const next: Record<string, EventAttendeeRow | undefined> = {};
    if (!userId) return next;
    for (const [eventId, rows] of Object.entries(eventAttendeesByEvent)) {
      next[eventId] = rows.find((row) => row.user_id === userId);
    }
    return next;
  }, [eventAttendeesByEvent, userId]);
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events.filter(
      (event) => new Date(event.ends_at).getTime() >= now - 60000,
    );
  }, [events]);

  const joinTeam = async (teamId: string) => {
    if (!userId || isWorkingTeamId) return;
    setErrorMessage("");
    setIsWorkingTeamId(teamId);
    const { error } = await supabase
      .from("team_memberships")
      .insert({ user_id: userId, team_id: teamId });

    if (error) {
      setErrorMessage(error.message);
      setIsWorkingTeamId(null);
      return;
    }

    setJoinedTeamIds((prev) =>
      prev.includes(teamId) ? prev : [...prev, teamId],
    );
    await refreshChatChannels(cityId);
    setIsWorkingTeamId(null);
  };

  const leaveTeam = async (teamId: string) => {
    if (!userId || isWorkingTeamId) return;
    setErrorMessage("");
    setIsWorkingTeamId(teamId);
    const { error } = await supabase
      .from("team_memberships")
      .delete()
      .eq("user_id", userId)
      .eq("team_id", teamId);

    if (error) {
      setErrorMessage(error.message);
      setIsWorkingTeamId(null);
      return;
    }

    setJoinedTeamIds((prev) => prev.filter((id) => id !== teamId));
    await refreshChatChannels(cityId);
    setIsWorkingTeamId(null);
  };

  const createTeam = async () => {
    if (!userId || !cityId || isCreatingTeam) return;
    const trimmedName = newTeamName.trim();
    const trimmedDescription = newTeamDescription.trim();

    if (!trimmedName) {
      setErrorMessage("Team name is required.");
      return;
    }

    setErrorMessage("");
    setIsCreatingTeam(true);

    const { error: createError } = await supabase.from("teams").insert({
      city_id: cityId,
      created_by: userId,
      name: trimmedName,
      description: trimmedDescription || null,
    });

    if (createError) {
      setErrorMessage(getFriendlyErrorMessage(createError.message));
      setIsCreatingTeam(false);
      return;
    }

    const { data: createdTeam, error: createdTeamError } = await supabase
      .from("teams")
      .select("id, name, description, city_id")
      .eq("city_id", cityId)
      .eq("created_by", userId)
      .ilike("name", trimmedName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (createdTeamError || !createdTeam) {
      setErrorMessage(
        createdTeamError?.message ??
          "Group was created, but we could not load it right away.",
      );
      setIsCreatingTeam(false);
      await loadSocialData();
      return;
    }

    const { error: joinError } = await supabase
      .from("team_memberships")
      .insert({
        user_id: userId,
        team_id: createdTeam.id,
        role: "captain",
      });

    if (joinError) {
      setErrorMessage(getFriendlyErrorMessage(joinError.message));
      setIsCreatingTeam(false);
      await loadSocialData();
      return;
    }

    setTeams((prev) =>
      [...prev, createdTeam as TeamRow].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setJoinedTeamIds((prev) =>
      prev.includes(createdTeam.id) ? prev : [...prev, createdTeam.id],
    );
    setNewTeamName("");
    setNewTeamDescription("");
    setIsCreateOpen(false);
    setIsCreatingTeam(false);
    await refreshChatChannels(cityId);
  };

  const resetCreateEventDrafts = () => {
    const nextWindow = makeDefaultEventWindowDrafts();
    setNewEventTitle("");
    setNewEventActivityType("community");
    setNewEventDescription("");
    setNewEventLocationName("");
    setNewEventLocationAddress("");
    setNewEventLocationNotes("");
    setNewEventStartsAt(nextWindow.startsAtDraft);
    setNewEventEndsAt(nextWindow.endsAtDraft);
    setNewEventSignUpDeadline("");
    setNewEventMaxAttendees("");
  };

  const createEvent = async () => {
    if (!userId || !cityId || isCreatingEvent) return;

    const title = newEventTitle.trim();
    const activityType = newEventActivityType.trim() || "community";
    const description = newEventDescription.trim();
    const locationName = newEventLocationName.trim();
    const locationAddress = newEventLocationAddress.trim();
    const locationNotes = newEventLocationNotes.trim();
    const signUpDeadlineText = newEventSignUpDeadline.trim();
    const maxAttendeesText = newEventMaxAttendees.trim();

    if (!title) {
      setErrorMessage("Event title is required.");
      return;
    }

    if (!locationName) {
      setErrorMessage("Location name is required.");
      return;
    }

    const startsAt = parseEventDateTime(newEventStartsAt);
    const endsAt = parseEventDateTime(newEventEndsAt);

    if (!startsAt || !endsAt) {
      setErrorMessage("Use YYYY-MM-DD HH:mm for start and end.");
      return;
    }

    if (endsAt <= startsAt) {
      setErrorMessage("Event end time must be after start time.");
      return;
    }

    let signUpDeadline: Date | null = null;
    if (signUpDeadlineText) {
      signUpDeadline = parseEventDateTime(signUpDeadlineText);
      if (!signUpDeadline) {
        setErrorMessage("Use YYYY-MM-DD HH:mm for signup deadline.");
        return;
      }
      if (signUpDeadline > startsAt) {
        setErrorMessage("Signup deadline must be before event start.");
        return;
      }
    }

    let maxAttendees: number | null = null;
    if (maxAttendeesText) {
      const parsedMax = Number.parseInt(maxAttendeesText, 10);
      if (!Number.isInteger(parsedMax) || parsedMax <= 0) {
        setErrorMessage("Max attendees must be a positive whole number.");
        return;
      }
      maxAttendees = parsedMax;
    }

    setErrorMessage("");
    setIsCreatingEvent(true);

    const { error } = await supabase.from("events").insert({
      city_id: cityId,
      created_by: userId,
      title,
      description: description || null,
      activity_type: activityType,
      location_name: locationName,
      location_address: locationAddress || null,
      location_notes: locationNotes || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      sign_up_deadline: signUpDeadline?.toISOString() ?? null,
      max_attendees: maxAttendees,
    });

    if (error) {
      setErrorMessage(getFriendlyEventErrorMessage(error.message));
      setIsCreatingEvent(false);
      return;
    }

    resetCreateEventDrafts();
    setIsCreateEventOpen(false);
    setIsCreatingEvent(false);
    await loadEventsData(cityId);
  };

  const upsertEventAttendance = async (
    eventId: string,
    status: Exclude<EventAttendanceStatus, "cancelled">,
  ) => {
    if (!userId || !cityId || workingEventId) return;
    setErrorMessage("");
    setWorkingEventId(eventId);

    const existing = myEventAttendanceByEvent[eventId];

    const { error } = existing
      ? await supabase
          .from("event_attendees")
          .update({ status })
          .eq("event_id", eventId)
          .eq("user_id", userId)
      : await supabase
          .from("event_attendees")
          .insert({ event_id: eventId, user_id: userId, status });

    if (error) {
      setErrorMessage(getFriendlyEventErrorMessage(error.message));
      setWorkingEventId(null);
      return;
    }

    await loadEventsData(cityId);
    setWorkingEventId(null);
  };

  const leaveEvent = async (eventId: string) => {
    if (!userId || !cityId || workingEventId) return;
    setErrorMessage("");
    setWorkingEventId(eventId);

    const { error } = await supabase
      .from("event_attendees")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);

    if (error) {
      setErrorMessage(getFriendlyEventErrorMessage(error.message));
      setWorkingEventId(null);
      return;
    }

    await loadEventsData(cityId);
    setWorkingEventId(null);
  };

  const toggleEventCancelled = async (event: EventRow) => {
    if (!userId || !cityId || workingEventId || event.created_by !== userId) {
      return;
    }

    setErrorMessage("");
    setWorkingEventId(event.id);
    const { error } = await supabase
      .from("events")
      .update({ is_cancelled: !event.is_cancelled })
      .eq("id", event.id)
      .eq("created_by", userId);

    if (error) {
      setErrorMessage(getFriendlyEventErrorMessage(error.message));
      setWorkingEventId(null);
      return;
    }

    await loadEventsData(cityId);
    setWorkingEventId(null);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!userId) return;

    const hasReaction = (reactionsByMessage[messageId] ?? []).some(
      (reaction) => reaction.user_id === userId && reaction.emoji === emoji,
    );

    const { error } = hasReaction
      ? await supabase
          .from("chat_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
      : await supabase
          .from("chat_message_reactions")
          .insert({ message_id: messageId, user_id: userId, emoji });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadChatData();
  };

  const sendComposer = async () => {
    if (!activeChannelId || !userId || isSendingMessage || isUploadingImage) {
      return;
    }

    const textBody = composerText.trim();

    if (!textBody) {
      setErrorMessage("Type a message first.");
      return;
    }

    setErrorMessage("");
    setIsSendingMessage(true);

    if (isThreadMode) {
      const { data, error } = await supabase.rpc("chat_create_thread", {
        p_channel_id: activeChannelId,
        p_body: textBody,
        p_title: threadTitleDraft.trim() || null,
        p_kind: "text",
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSendingMessage(false);
        return;
      }

      setActiveThreadId(data?.[0]?.thread_id ?? null);
    } else {
      const { error } = await supabase.rpc("chat_send_message", {
        p_channel_id: activeChannelId,
        p_body: textBody,
        p_kind: "text",
        p_thread_id: activeThreadId ?? null,
        p_reply_to_message_id: replyToMessageId ?? null,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSendingMessage(false);
        return;
      }
    }

    setComposerText("");
    setReplyToMessageId(null);
    setThreadTitleDraft("");
    setIsThreadMode(false);
    await loadChatData();
    setIsSendingMessage(false);
  };

  const uploadKeyboardMediaMessage = async (
    event: KeyboardImageChangeEvent,
  ) => {
    if (!activeChannelId || !userId || isUploadingImage || isSendingMessage) {
      return;
    }

    const data = event.nativeEvent.data?.trim();
    if (!data) {
      setErrorMessage("Could not read media from your keyboard.");
      return;
    }

    setErrorMessage("");
    setIsUploadingImage(true);

    try {
      const mimeType = (event.nativeEvent.mime ?? "image/gif").toLowerCase();
      const attachmentKind = mimeType.includes("gif") ? "gif" : "image";
      const extension = getFileExtension(event.nativeEvent.uri, mimeType);
      const storagePath = `${activeChannelId}/${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;
      const mediaBytes = base64ToUint8Array(data);

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, mediaBytes, {
          cacheControl: "3600",
          upsert: false,
          contentType: mimeType,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message);
        setIsUploadingImage(false);
        return;
      }

      const linkUri = event.nativeEvent.linkUri?.trim() ?? null;
      const metadata =
        linkUri && /^https?:\/\//i.test(linkUri) ? { source_url: linkUri } : {};
      const { data: messageId, error: messageError } = await supabase.rpc(
        "chat_send_message",
        {
          p_channel_id: activeChannelId,
          p_body: composerText.trim() || null,
          p_kind: attachmentKind,
          p_thread_id: activeThreadId ?? null,
          p_reply_to_message_id: replyToMessageId ?? null,
          p_metadata: metadata,
        },
      );

      if (messageError || !messageId) {
        setErrorMessage(
          messageError?.message ?? "Could not create media message.",
        );
        setIsUploadingImage(false);
        return;
      }

      const { error: attachmentError } = await supabase
        .from("chat_message_attachments")
        .insert({
          message_id: messageId,
          uploaded_by: userId,
          kind: attachmentKind,
          storage_bucket: "chat-media",
          storage_path: storagePath,
          mime_type: mimeType,
          file_size_bytes: Math.max(1, mediaBytes.byteLength),
          width: null,
          height: null,
        });

      if (attachmentError) {
        setErrorMessage(attachmentError.message);
        setIsUploadingImage(false);
        return;
      }

      setComposerText("");
      setReplyToMessageId(null);
      setThreadTitleDraft("");
      setIsThreadMode(false);
      await loadChatData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not send media from keyboard.",
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageMessage = async () => {
    if (!activeChannelId || !userId || isUploadingImage || isSendingMessage) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Photo library access is needed to send images in chat.",
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });

    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    setErrorMessage("");
    setIsUploadingImage(true);

    try {
      const [asset] = pickerResult.assets;
      const extension = getFileExtension(asset.uri, asset.mimeType);
      const mimeType = asset.mimeType ?? `image/${extension}`;
      const storagePath = `${activeChannelId}/${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;
      const imageBody = await readImageUriAsBlob(asset.uri);

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, imageBody, {
          cacheControl: "3600",
          upsert: false,
          contentType: mimeType,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message);
        setIsUploadingImage(false);
        return;
      }

      const { data: messageId, error: messageError } = await supabase.rpc(
        "chat_send_message",
        {
          p_channel_id: activeChannelId,
          p_body: composerText.trim() || null,
          p_kind: "image",
          p_thread_id: activeThreadId ?? null,
          p_reply_to_message_id: replyToMessageId ?? null,
        },
      );

      if (messageError || !messageId) {
        setErrorMessage(
          messageError?.message ?? "Could not create image message.",
        );
        setIsUploadingImage(false);
        return;
      }

      const { error: attachmentError } = await supabase
        .from("chat_message_attachments")
        .insert({
          message_id: messageId,
          uploaded_by: userId,
          kind: "image",
          storage_bucket: "chat-media",
          storage_path: storagePath,
          mime_type: mimeType,
          file_size_bytes: Math.max(
            1,
            Math.round(asset.fileSize ?? imageBody.size ?? 1),
          ),
          width: asset.width ?? null,
          height: asset.height ?? null,
        });

      if (attachmentError) {
        setErrorMessage(attachmentError.message);
        setIsUploadingImage(false);
        return;
      }

      setComposerText("");
      setReplyToMessageId(null);
      await loadChatData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not upload image.",
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header Section */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>The Grove</Text>
          <View style={styles.locationTag}>
            <Ionicons name="location" size={14} color={COLORS.primary} />
            <Text style={styles.subtitle}>
              {cityName || "Global Root"}
            </Text>
          </View>
        </View>
        
        {activeTab === "groups" && (
          <Pressable 
            disabled={!cityId}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsCreateOpen(!isCreateOpen);
            }}
            style={[styles.fab, isCreateOpen && styles.fabActive]}
          >
            <Ionicons 
              name={isCreateOpen ? "close" : "people-outline"} 
              size={24} 
              color={isCreateOpen ? COLORS.primary : COLORS.background} 
            />
          </Pressable>
        )}
        
        {activeTab === "events" && (
          <Pressable 
            disabled={!cityId}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsCreateEventOpen(!isCreateEventOpen);
            }}
            style={[styles.fab, isCreateEventOpen && styles.fabActive]}
          >
            <Ionicons 
              name={isCreateEventOpen ? "close" : "calendar-outline"} 
              size={24} 
              color={isCreateEventOpen ? COLORS.primary : COLORS.background} 
            />
          </Pressable>
        )}
      </View>

      {/* Segmented Control */}
      <View style={styles.tabBarContainer}>
        {Platform.OS === "ios" && (
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.tabBar}>
          {(["chat", "events", "groups"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveTab(tab);
              }}
              style={[
                styles.tabItem,
                activeTab === tab && styles.tabItemActive
              ]}
            >
              <Text style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive
              ]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!!errorMessage && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={COLORS.warning} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable onPress={() => setErrorMessage("")}>
            <Ionicons name="close" size={18} color={COLORS.warning} />
          </Pressable>
        </View>
      )}

      {/* Tab Content */}
      {activeTab === "chat" && (
        <KeyboardAvoidingView 
          style={styles.flexOne} 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={styles.chatNav}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatRail}>
              {channels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                return (
                  <Pressable
                    key={channel.id}
                    onPress={() => {
                      setActiveChannelId(channel.id);
                      setActiveThreadId(null);
                      setReplyToMessageId(null);
                    }}
                    style={[styles.chatChip, isActive && styles.chatChipActive]}
                  >
                    <Ionicons 
                      name={channel.scope === "city" ? "business" : "people"} 
                      size={14} 
                      color={isActive ? COLORS.background : COLORS.primary} 
                    />
                    <Text style={[styles.chatChipText, isActive && styles.chatChipTextActive]}>
                      {channel.display_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            
            {threads.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatRail}>
                <Pressable
                  onPress={() => { setActiveThreadId(null); setReplyToMessageId(null); }}
                  style={[styles.threadChip, !activeThreadId && styles.threadChipActive]}
                >
                  <Text style={[styles.threadChipText, !activeThreadId && styles.threadChipTextActive]}>Main</Text>
                </Pressable>
                {threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const count = threadMessageCount[thread.id] ?? 0;
                  return (
                    <Pressable
                      key={thread.id}
                      onPress={() => { setActiveThreadId(thread.id); setReplyToMessageId(null); }}
                      style={[styles.threadChip, isActive && styles.threadChipActive]}
                    >
                      <Text style={[styles.threadChipText, isActive && styles.threadChipTextActive]} numberOfLines={1}>
                        {`${thread.title?.trim() || "Thread"} (${count})`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.chatFeed}>
            {isChatLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : visibleMessages.length === 0 ? (
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={48} color={COLORS.secondary + "40"} />
                <Text style={styles.emptyText}>No messages yet. Sprout the conversation!</Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.chatFeedScroll} 
                contentContainerStyle={styles.chatFeedContent}
                showsVerticalScrollIndicator={false}
              >
                {visibleMessages.map((message) => {
                  const isMine = message.sender_id === userId;
                  const sender = profilesById[message.sender_id];
                  const attachments = attachmentsByMessage[message.id] ?? [];
                  const reactions = reactionsByMessage[message.id] ?? [];
                  const reactionSummary = reactions.reduce((acc, r) => {
                    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
                    acc[r.emoji].count += 1;
                    if (r.user_id === userId) acc[r.emoji].mine = true;
                    return acc;
                  }, {} as Record<string, { count: number; mine: boolean }>);

                  return (
                    <View key={message.id} style={[styles.messageRow, isMine && styles.messageRowMine]}>
                      {!isMine && (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarText}>
                            {(sender?.display_name || "M").charAt(0)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.messageContent}>
                        {!isMine && (
                          <Text style={styles.messageSenderName}>
                            {sender?.display_name || "Member"}
                          </Text>
                        )}
                        <View style={[
                          styles.messageBubble,
                          isMine ? styles.messageBubbleMine : styles.messageBubbleOther
                        ]}>
                          {message.reply_to_message_id && (
                            <View style={styles.replyPreviewInline}>
                              <Text style={styles.replyPreviewTextInline} numberOfLines={1}>
                                {messagePreview(messageById[message.reply_to_message_id])}
                              </Text>
                            </View>
                          )}
                          {message.kind !== "image" && !!message.body && (
                            <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                              {message.body}
                            </Text>
                          )}
                          {getGifUrl(message) && (
                            <Image source={{ uri: getGifUrl(message)! }} style={styles.messageMedia} />
                          )}
                          {attachments.map(a => (
                            signedAttachmentUrls[a.storage_path] && (
                              <Image key={a.id} source={{ uri: signedAttachmentUrls[a.storage_path] }} style={styles.messageMedia} />
                            )
                          ))}
                        </View>
                        
                        <View style={[styles.messageMeta, isMine && styles.messageMetaMine]}>
                          <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
                          <Pressable onPress={() => { setReplyToMessageId(message.id); setIsThreadMode(false); }}>
                            <Text style={styles.messageActionText}>Reply</Text>
                          </Pressable>
                        </View>

                        {(Object.keys(reactionSummary).length > 0) && (
                          <View style={[styles.reactionList, isMine && styles.reactionListMine]}>
                            {Object.entries(reactionSummary).map(([emoji, data]) => (
                              <Pressable 
                                key={emoji} 
                                onPress={() => void toggleReaction(message.id, emoji)}
                                style={[styles.reactionChip, data.mine && styles.reactionChipMine]}
                              >
                                <Text style={styles.reactionChipText}>{`${emoji} ${data.count}`}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Chat Composer */}
          <View style={styles.composerContainer}>
            {replyToMessage && (
              <View style={styles.replyBar}>
                <Ionicons name="return-down-forward" size={14} color={COLORS.primary} />
                <Text style={styles.replyBarText} numberOfLines={1}>
                  Replying to: {messagePreview(replyToMessage)}
                </Text>
                <Pressable onPress={() => setReplyToMessageId(null)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.secondary} />
                </Pressable>
              </View>
            )}
            
            <View style={styles.composerControls}>
              <Pressable 
                onPress={() => setIsThreadMode(!isThreadMode)}
                style={[styles.controlButton, isThreadMode && styles.controlButtonActive]}
              >
                <Ionicons name="list" size={18} color={isThreadMode ? COLORS.background : COLORS.primary} />
              </Pressable>
              <Pressable 
                onPress={() => void uploadImageMessage()}
                style={styles.controlButton}
              >
                <Ionicons name="image" size={18} color={COLORS.primary} />
              </Pressable>
            </View>

            {isThreadMode && (
              <TextInput
                placeholder="Thread Subject..."
                placeholderTextColor={COLORS.text + "60"}
                value={threadTitleDraft}
                onChangeText={setThreadTitleDraft}
                style={styles.threadInput}
              />
            )}

            <View style={styles.inputRow}>
              <TextInput
                placeholder="Say something..."
                placeholderTextColor={COLORS.text + "60"}
                value={composerText}
                onChangeText={setComposerText}
                onImageChange={(event) => void uploadKeyboardMediaMessage(event)}
                style={styles.composerInput}
                multiline
              />
              <Pressable 
                onPress={() => void sendComposer()}
                disabled={isSendingMessage || isUploadingImage || !activeChannelId}
                style={styles.sendButton}
              >
                {isSendingMessage || isUploadingImage ? (
                  <ActivityIndicator color={COLORS.background} size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={COLORS.background} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {activeTab === "events" && (
        <ScrollView contentContainerStyle={styles.tabContentScroll} showsVerticalScrollIndicator={false}>
          {isCreateEventOpen && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Sprout an Event</Text>
              <TextInput placeholder="Event Title" placeholderTextColor={COLORS.text + "60"} value={newEventTitle} onChangeText={setNewEventTitle} style={styles.formInput} />
              <TextInput placeholder="Type (Cleanup, Social, etc.)" placeholderTextColor={COLORS.text + "60"} value={newEventActivityType} onChangeText={setNewEventActivityType} style={styles.formInput} />
              <TextInput placeholder="Location Name" placeholderTextColor={COLORS.text + "60"} value={newEventLocationName} onChangeText={setNewEventLocationName} style={styles.formInput} />
              <TextInput placeholder="Address" placeholderTextColor={COLORS.text + "60"} value={newEventLocationAddress} onChangeText={setNewEventLocationAddress} style={styles.formInput} />
              <TextInput placeholder="Starts (YYYY-MM-DD HH:mm)" placeholderTextColor={COLORS.text + "60"} value={newEventStartsAt} onChangeText={setNewEventStartsAt} style={styles.formInput} />
              <TextInput placeholder="Ends (YYYY-MM-DD HH:mm)" placeholderTextColor={COLORS.text + "60"} value={newEventEndsAt} onChangeText={setNewEventEndsAt} style={styles.formInput} />
              <TextInput placeholder="Description" placeholderTextColor={COLORS.text + "60"} value={newEventDescription} onChangeText={setNewEventDescription} style={[styles.formInput, styles.formInputMulti]} multiline />
              <View style={styles.formActions}>
                <Pressable onPress={resetCreateEventDrafts} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </Pressable>
                <Pressable onPress={() => void createEvent()} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Create Event</Text>
                </Pressable>
              </View>
            </View>
          )}

          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.secondary + "40"} />
              <Text style={styles.emptyText}>No upcoming events in {cityName || "your region"}.</Text>
            </View>
          ) : (
            upcomingEvents.map(event => {
              const attendeeSummary = eventAttendeeSummaryByEvent[event.id] || { going: 0, waitlist: 0 };
              const myAttendance = myEventAttendanceByEvent[event.id];
              const isCreator = event.created_by === userId;
              
              return (
                <View key={event.id} style={styles.eventCard}>
                  <View style={styles.eventCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventCardTitle}>{event.title}</Text>
                      <Text style={styles.eventCardType}>{event.activity_type}</Text>
                    </View>
                    {event.is_cancelled && (
                      <View style={styles.cancelledBadge}>
                        <Text style={styles.cancelledBadgeText}>Cancelled</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.eventInfoRow}>
                    <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.eventInfoText}>{formatEventWindow(event.starts_at, event.ends_at)}</Text>
                  </View>
                  <View style={styles.eventInfoRow}>
                    <Ionicons name="location-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.eventInfoText}>{event.location_name}</Text>
                  </View>

                  {event.description && (
                    <Text style={styles.eventCardDesc} numberOfLines={2}>{event.description}</Text>
                  )}

                  <View style={styles.eventFooter}>
                    <View style={styles.attendeePill}>
                      <Text style={styles.attendeePillText}>
                        {event.max_attendees ? `${attendeeSummary.going}/${event.max_attendees} Going` : `${attendeeSummary.going} Going`}
                      </Text>
                    </View>
                    
                    <View style={styles.eventActions}>
                      {myAttendance ? (
                        <Pressable onPress={() => void leaveEvent(event.id)} style={styles.leaveButton}>
                          <Text style={styles.leaveButtonText}>Leave</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => void upsertEventAttendance(event.id, "going")} style={styles.joinButton}>
                          <Text style={styles.joinButtonText}>Join</Text>
                        </Pressable>
                      )}
                      
                      {isCreator && (
                        <Pressable onPress={() => void toggleEventCancelled(event)} style={styles.adminButton}>
                          <Ionicons name="settings-outline" size={16} color={COLORS.secondary} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {activeTab === "groups" && (
        <ScrollView contentContainerStyle={styles.tabContentScroll} showsVerticalScrollIndicator={false}>
          {isCreateOpen && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>New Group</Text>
              <TextInput placeholder="Group Name" placeholderTextColor={COLORS.text + "60"} value={newTeamName} onChangeText={setNewTeamName} style={styles.formInput} />
              <TextInput placeholder="Description" placeholderTextColor={COLORS.text + "60"} value={newTeamDescription} onChangeText={setNewTeamDescription} style={[styles.formInput, styles.formInputMulti]} multiline />
              <Pressable onPress={() => void createTeam()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Create Group</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionLabel}>Regional Groups</Text>
          {teams.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No groups found. Be the first to start one!</Text>
            </View>
          ) : (
            teams.map(team => {
              const isJoined = joinedTeamIds.includes(team.id);
              return (
                <View key={team.id} style={styles.teamCard}>
                  <View style={styles.teamIcon}>
                    <Ionicons name="people" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.teamName}>{team.name}</Text>
                    {team.description && <Text style={styles.teamDesc} numberOfLines={1}>{team.description}</Text>}
                  </View>
                  <Pressable 
                    onPress={() => isJoined ? leaveTeam(team.id) : joinTeam(team.id)}
                    style={[styles.teamActionBtn, isJoined && styles.teamActionBtnJoined]}
                  >
                    <Text style={[styles.teamActionBtnText, isJoined && styles.teamActionBtnTextJoined]}>
                      {isJoined ? "Leave" : "Join"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flexOne: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    color: COLORS.primary,
    fontSize: 32,
    fontFamily: "Boogaloo_400Regular",
  },
  locationTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "40",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    marginLeft: 4,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabActive: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  tabBarContainer: {
    marginHorizontal: 24,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.accent + "20",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary + "15",
  },
  tabBar: {
    flexDirection: "row",
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 15,
  },
  tabTextActive: {
    color: COLORS.background,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warning + "15",
    marginHorizontal: 24,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: COLORS.warning,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
    flex: 1,
  },
  tabContentScroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 16,
    marginTop: 8,
  },
  /* Chat Styles */
  chatNav: {
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 12,
  },
  chatRail: {
    gap: 8,
    paddingRight: 24,
  },
  chatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.accent + "30",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  chatChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chatChipText: {
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  chatChipTextActive: {
    color: COLORS.background,
  },
  threadChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.accent + "15",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  threadChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  threadChipText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontFamily: "Boogaloo_400Regular",
  },
  threadChipTextActive: {
    color: COLORS.background,
  },
  chatFeed: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  chatFeedScroll: {
    flex: 1,
  },
  chatFeedContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 12,
  },
  messageRowMine: {
    flexDirection: "row-reverse",
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  avatarText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  messageContent: {
    flex: 1,
    maxWidth: "80%",
  },
  messageSenderName: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 4,
    marginLeft: 4,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: COLORS.accent + "40",
    borderWidth: 1,
    borderColor: COLORS.secondary + "15",
  },
  messageBubbleMine: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    borderTopRightRadius: 4,
  },
  messageBubbleOther: {
    borderTopLeftRadius: 4,
  },
  messageText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    lineHeight: 20,
  },
  messageTextMine: {
    color: COLORS.background,
  },
  messageMedia: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: COLORS.accent,
  },
  messageMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    marginHorizontal: 4,
  },
  messageMetaMine: {
    justifyContent: "flex-end",
  },
  messageTime: {
    color: COLORS.secondary,
    fontSize: 11,
    fontFamily: "Boogaloo_400Regular",
  },
  messageActionText: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: "Boogaloo_400Regular",
  },
  reactionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  reactionListMine: {
    justifyContent: "flex-end",
  },
  reactionChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: COLORS.accent + "30",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  reactionChipMine: {
    borderColor: COLORS.primary + "60",
    backgroundColor: COLORS.primary + "10",
  },
  reactionChipText: {
    fontSize: 10,
    color: COLORS.text,
  },
  replyPreviewInline: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.background + "40",
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.secondary,
  },
  replyPreviewTextInline: {
    fontSize: 11,
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
  },
  /* Composer Styles */
  composerContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 140 : 120,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.secondary + "15",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "20",
    padding: 8,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  replyBarText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  composerControls: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.accent + "30",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonActive: {
    backgroundColor: COLORS.primary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerInput: {
    flex: 1,
    backgroundColor: COLORS.accent + "20",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: COLORS.text,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 16,
    maxHeight: 100,
  },
  threadInput: {
    backgroundColor: COLORS.accent + "20",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: COLORS.primary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  /* Form Styles */
  formCard: {
    backgroundColor: COLORS.accent + "20",
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  formTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
    marginBottom: 16,
  },
  formInput: {
    backgroundColor: COLORS.background + "80",
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
  },
  formInputMulti: {
    height: 80,
    textAlignVertical: "top",
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: COLORS.background,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 16,
  },
  /* Event Card Styles */
  eventCard: {
    backgroundColor: COLORS.accent + "15",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary + "15",
  },
  eventCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  eventCardTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontFamily: "Boogaloo_400Regular",
  },
  eventCardType: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    textTransform: "uppercase",
  },
  eventInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  eventInfoText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  eventCardDesc: {
    color: COLORS.text + "CC",
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 8,
    lineHeight: 18,
  },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.secondary + "10",
  },
  attendeePill: {
    backgroundColor: COLORS.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attendeePillText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
  },
  eventActions: {
    flexDirection: "row",
    gap: 8,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
  },
  joinButtonText: {
    color: COLORS.background,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 14,
  },
  leaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
  },
  leaveButtonText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 14,
  },
  adminButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelledBadge: {
    backgroundColor: COLORS.warning + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cancelledBadgeText: {
    color: COLORS.warning,
    fontSize: 10,
    fontFamily: "Boogaloo_400Regular",
  },
  /* Team Card Styles */
  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + "15",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "10",
  },
  teamIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  teamName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  teamDesc: {
    color: COLORS.text + "99",
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  teamActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  teamActionBtnJoined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
  },
  teamActionBtnText: {
    color: COLORS.background,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 13,
  },
  teamActionBtnTextJoined: {
    color: COLORS.secondary,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent + "05",
    borderRadius: 24,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    marginTop: 12,
  },
  emptyText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
