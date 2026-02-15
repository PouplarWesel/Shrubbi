import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Keyboard,
  Linking,
  Modal,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";
import {
  readCachedValue,
  removeCachedValue,
  removeCachedValuesByPrefix,
  writeCachedValue,
} from "@/lib/localCache";
import type { Json } from "@/supabase/database.types";

import "./imageKeyboard";

const SOCIAL_TAB_BAR_HEIGHT = 56;
const SOCIAL_TAB_BAR_BOTTOM_GAP = 10;

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

type LocationSuggestion = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type KeyboardImageChangeEvent = {
  nativeEvent: {
    uri: string;
    data: string;
    linkUri?: string | null;
    mime?: string | null;
  };
};

type SocialOverviewCachePayload = {
  activeChannelId: string | null;
  channels: ChatChannelRow[];
  cityId: string | null;
  cityName: string | null;
  eventAttendeesByEvent: Record<string, EventAttendeeRow[]>;
  eventOrganizersById: Record<string, PublicProfileRow>;
  events: EventRow[];
  joinedTeamIds: string[];
  teamMemberCountById: Record<string, number>;
  teams: TeamRow[];
};

type SocialChatCachePayload = {
  attachmentsByMessage: Record<string, ChatAttachmentRow[]>;
  messages: ChatMessageRow[];
  profilesById: Record<string, PublicProfileRow>;
  reactionsByMessage: Record<string, ChatReactionRow[]>;
  threads: ChatThreadRow[];
};

const QUICK_REACTIONS = [
  "\u{1F331}",
  "\u{1F525}",
  "\u{1F4A7}",
  "\u{1F44F}",
  "\u{1F602}",
] as const;
const EVENT_DATE_TIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:\s+|T)(\d{2}):(\d{2})$/;
const CHAT_MEDIA_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const LOCATION_AUTOCOMPLETE_DEBOUNCE_MS = 300;
const LOCATION_AUTOCOMPLETE_LIMIT = 6;
const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

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

const buildGoogleMapsUrl = (event: EventRow) => {
  if (
    typeof event.latitude === "number" &&
    typeof event.longitude === "number"
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }

  const locationQuery = [event.location_name, event.location_address]
    .filter(
      (segment): segment is string => !!segment && segment.trim().length > 0,
    )
    .join(", ");
  if (!locationQuery) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    locationQuery,
  )}`;
};

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

const sanitizeWebImageForUpload = async (
  file: File,
): Promise<{ body: Blob | File; mimeType: string; size: number }> => {
  const normalizedType = (
    file.type || "application/octet-stream"
  ).toLowerCase();
  if (normalizedType.includes("gif")) {
    // Keep GIF binary as-is to preserve animation frames.
    return {
      body: file,
      mimeType: normalizedType || "image/gif",
      size: Math.max(1, file.size || 1),
    };
  }
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !normalizedType.startsWith("image/") ||
    typeof URL === "undefined"
  ) {
    return {
      body: file,
      mimeType: normalizedType,
      size: Math.max(1, file.size || 1),
    };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image file."));
      img.src = objectUrl;
    });

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) {
      return {
        body: file,
        mimeType: normalizedType,
        size: Math.max(1, file.size || 1),
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        body: file,
        mimeType: normalizedType,
        size: Math.max(1, file.size || 1),
      };
    }

    context.drawImage(image, 0, 0, width, height);

    const outputType =
      normalizedType === "image/png" || normalizedType === "image/webp"
        ? normalizedType
        : "image/jpeg";

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error("Could not process image for upload."));
        },
        outputType,
        outputType === "image/jpeg" ? 0.9 : undefined,
      );
    });

    return {
      body: blob,
      mimeType: outputType,
      size: Math.max(1, blob.size),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const base64ToUint8Array = (value: string) => {
  const normalized = value
    .replace(/^data:[^;]+;base64,/, "")
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
  const insets = useSafeAreaInsets();
  const initialEventWindow = useMemo(makeDefaultEventWindowDrafts, []);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkingTeamId, setIsWorkingTeamId] = useState<string | null>(null);
  const [workingEventId, setWorkingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [cityName, setCityName] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [joinedTeamIds, setJoinedTeamIds] = useState<string[]>([]);
  const [teamMemberCountById, setTeamMemberCountById] = useState<
    Record<string, number>
  >({});
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
  const [newEventLatitude, setNewEventLatitude] = useState<number | null>(null);
  const [newEventLongitude, setNewEventLongitude] = useState<number | null>(
    null,
  );
  const [newEventLocationNotes, setNewEventLocationNotes] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  const [isLoadingLocationSuggestions, setIsLoadingLocationSuggestions] =
    useState(false);
  const [isLocationSuggestionListOpen, setIsLocationSuggestionListOpen] =
    useState(false);
  const [newEventStartsAt, setNewEventStartsAt] = useState(
    initialEventWindow.startsAtDraft,
  );
  const [newEventEndsAt, setNewEventEndsAt] = useState(
    initialEventWindow.endsAtDraft,
  );
  const [newEventSignUpDeadline, setNewEventSignUpDeadline] = useState("");
  const [newEventMaxAttendees, setNewEventMaxAttendees] = useState("");
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventActivityType, setEditEventActivityType] = useState("");
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventLocationName, setEditEventLocationName] = useState("");
  const [editEventLocationAddress, setEditEventLocationAddress] = useState("");
  const [editEventLocationNotes, setEditEventLocationNotes] = useState("");
  const [editEventStartsAt, setEditEventStartsAt] = useState("");
  const [editEventEndsAt, setEditEventEndsAt] = useState("");
  const [editEventSignUpDeadline, setEditEventSignUpDeadline] = useState("");
  const [editEventMaxAttendees, setEditEventMaxAttendees] = useState("");
  const [isSavingEventEdits, setIsSavingEventEdits] = useState(false);
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
  const [activeTab, setActiveTab] = useState<"chat" | "events" | "groups">(
    "chat",
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const userId = session?.user?.id ?? null;
  const { height: windowHeight } = useWindowDimensions();
  const isPhoneWeb = useMemo(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
    return /android|iphone|ipod|mobile/i.test(navigator.userAgent);
  }, []);
  const isChatComposeDisabled = isPhoneWeb;
  const socialOverviewCacheKey = userId ? `social:overview:${userId}` : null;
  const socialChatCacheKey = useMemo(
    () =>
      userId && activeChannelId
        ? `social:chat:${userId}:${activeChannelId}`
        : null,
    [activeChannelId, userId],
  );

  const messageIdSetRef = useRef<Set<string>>(new Set());
  const profilesByIdRef = useRef<Record<string, PublicProfileRow>>({});
  const signedAttachmentUrlsRef = useRef<Record<string, string>>({});
  const attachmentsByMessageRef = useRef<Record<string, ChatAttachmentRow[]>>(
    {},
  );
  const pendingAttachmentsRef = useRef<Record<string, ChatAttachmentRow[]>>({});
  const pendingReactionsRef = useRef<Record<string, ChatReactionRow[]>>({});
  const messageHydrationTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const locationSuggestionRequestIdRef = useRef(0);
  const chatFeedScrollRef = useRef<ScrollView | null>(null);
  const shouldAutoScrollChatRef = useRef(true);
  const maxWindowHeightRef = useRef(windowHeight);

  useEffect(() => {
    if (windowHeight > maxWindowHeightRef.current) {
      maxWindowHeightRef.current = windowHeight;
    }
  }, [windowHeight]);

  useEffect(() => {
    messageIdSetRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    profilesByIdRef.current = profilesById;
  }, [profilesById]);

  useEffect(() => {
    signedAttachmentUrlsRef.current = signedAttachmentUrls;
  }, [signedAttachmentUrls]);

  useEffect(() => {
    attachmentsByMessageRef.current = attachmentsByMessage;
  }, [attachmentsByMessage]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    pendingAttachmentsRef.current = {};
    pendingReactionsRef.current = {};

    for (const timer of Object.values(messageHydrationTimersRef.current)) {
      clearTimeout(timer);
    }
    messageHydrationTimersRef.current = {};
  }, [activeChannelId]);

  useEffect(() => {
    if (!socialOverviewCacheKey) return;

    let isCancelled = false;

    const hydrateSocialOverviewCache = async () => {
      const cached = await readCachedValue<SocialOverviewCachePayload>(
        socialOverviewCacheKey,
        24 * 60 * 60 * 1000,
      );
      if (!cached || isCancelled) return;

      setCityId(cached.cityId);
      setCityName(cached.cityName);
      setTeams(cached.teams);
      setJoinedTeamIds(cached.joinedTeamIds);
      setTeamMemberCountById(cached.teamMemberCountById);
      setEvents(cached.events);
      setEventAttendeesByEvent(cached.eventAttendeesByEvent);
      setEventOrganizersById(cached.eventOrganizersById);
      setChannels(cached.channels);
      setActiveChannelId(cached.activeChannelId);
      setIsLoading(false);
    };

    void hydrateSocialOverviewCache();

    return () => {
      isCancelled = true;
    };
  }, [socialOverviewCacheKey]);

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
  const closedComposerBottomPadding =
    Math.max(insets.bottom, SOCIAL_TAB_BAR_BOTTOM_GAP) +
    SOCIAL_TAB_BAR_HEIGHT +
    8;
  const openComposerBottomPadding =
    Platform.OS === "ios" ? Math.max(insets.bottom, 12) : 12;
  const composerBottomPadding = isKeyboardVisible
    ? openComposerBottomPadding
    : closedComposerBottomPadding;
  const windowShrink = Math.max(0, maxWindowHeightRef.current - windowHeight);
  const composerKeyboardLift = isKeyboardVisible
    ? Math.max(0, keyboardHeight - windowShrink)
    : 0;
  const createLocationSearchQuery = useMemo(() => {
    const addressQuery = newEventLocationAddress.trim();
    if (addressQuery.length >= 3) return addressQuery;
    return newEventLocationName.trim();
  }, [newEventLocationAddress, newEventLocationName]);

  const handleCreateEventLocationNameChange = useCallback((value: string) => {
    setNewEventLocationName(value);
    setNewEventLatitude(null);
    setNewEventLongitude(null);
    setIsLocationSuggestionListOpen(value.trim().length >= 2);
  }, []);

  const handleCreateEventLocationAddressChange = useCallback(
    (value: string) => {
      setNewEventLocationAddress(value);
      setNewEventLatitude(null);
      setNewEventLongitude(null);
      setIsLocationSuggestionListOpen(value.trim().length >= 2);
    },
    [],
  );

  const applyLocationSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      setNewEventLocationName(suggestion.name);
      setNewEventLocationAddress(suggestion.address);
      setNewEventLatitude(suggestion.latitude);
      setNewEventLongitude(suggestion.longitude);
      setLocationSuggestions([]);
      setIsLocationSuggestionListOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (!isCreateEventOpen || !isLocationSuggestionListOpen) {
      setIsLoadingLocationSuggestions(false);
      setLocationSuggestions([]);
      return;
    }

    if (!MAPBOX_ACCESS_TOKEN) {
      setIsLoadingLocationSuggestions(false);
      setLocationSuggestions([]);
      return;
    }

    const query = createLocationSearchQuery;
    if (query.length < 3) {
      setIsLoadingLocationSuggestions(false);
      setLocationSuggestions([]);
      return;
    }

    const requestId = locationSuggestionRequestIdRef.current + 1;
    locationSuggestionRequestIdRef.current = requestId;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsLoadingLocationSuggestions(true);
      try {
        const queryWithContext = cityName ? `${query}, ${cityName}` : query;
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            queryWithContext,
          )}.json?autocomplete=true&types=address,poi,place,locality,neighborhood&limit=${LOCATION_AUTOCOMPLETE_LIMIT}&language=en&access_token=${MAPBOX_ACCESS_TOKEN}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Location search failed");
        }

        const payload = await response.json();
        const features = Array.isArray(payload?.features)
          ? payload.features
          : [];
        const nextSuggestions = features
          .map((feature: any, index: number): LocationSuggestion | null => {
            const address =
              typeof feature?.place_name === "string"
                ? feature.place_name.trim()
                : "";
            if (!address) return null;

            const baseName =
              typeof feature?.text === "string" &&
              feature.text.trim().length > 0
                ? feature.text.trim()
                : address.split(",")[0]?.trim() || address;
            const center = Array.isArray(feature?.center) ? feature.center : [];
            const longitude = typeof center[0] === "number" ? center[0] : null;
            const latitude = typeof center[1] === "number" ? center[1] : null;

            return {
              id:
                typeof feature?.id === "string" && feature.id.trim().length > 0
                  ? feature.id
                  : `location-suggestion-${requestId}-${index}`,
              name: baseName,
              address,
              latitude,
              longitude,
            };
          })
          .filter(
            (
              suggestion: LocationSuggestion | null,
            ): suggestion is LocationSuggestion => !!suggestion,
          );

        if (locationSuggestionRequestIdRef.current === requestId) {
          setLocationSuggestions(nextSuggestions);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (locationSuggestionRequestIdRef.current === requestId) {
          setLocationSuggestions([]);
        }
      } finally {
        if (locationSuggestionRequestIdRef.current === requestId) {
          setIsLoadingLocationSuggestions(false);
        }
      }
    }, LOCATION_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    cityName,
    createLocationSearchQuery,
    isCreateEventOpen,
    isLocationSuggestionListOpen,
  ]);

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

  const loadTeamMemberCounts = useCallback(
    async (nextCityId: string | null) => {
      if (!nextCityId) {
        setTeamMemberCountById({});
        return;
      }

      const { data, error } = await supabase
        .from("team_leaderboard")
        .select("team_id, member_count")
        .eq("city_id", nextCityId);

      if (error) {
        console.error("Could not load group member counts", error);
        return;
      }

      const nextCounts: Record<string, number> = {};
      for (const row of (data ?? []) as {
        team_id: string | null;
        member_count: number | null;
      }[]) {
        if (!row.team_id) continue;
        nextCounts[row.team_id] = row.member_count ?? 0;
      }

      setTeamMemberCountById(nextCounts);
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
    if (teams.length === 0 && channels.length === 0 && events.length === 0) {
      setIsLoading(true);
    }
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
      loadTeamMemberCounts(currentCityId),
    ]);
    setIsLoading(false);
  }, [
    channels.length,
    events.length,
    loadEventsData,
    loadTeamMemberCounts,
    refreshChatChannels,
    supabase,
    teams.length,
    userId,
  ]);

  useEffect(() => {
    void loadSocialData();
  }, [loadSocialData]);

  useEffect(() => {
    if (!socialChatCacheKey) return;

    let isCancelled = false;

    const hydrateChatCache = async () => {
      const cached = await readCachedValue<SocialChatCachePayload>(
        socialChatCacheKey,
        12 * 60 * 60 * 1000,
      );
      if (!cached || isCancelled) return;

      setThreads(cached.threads);
      setMessages(cached.messages);
      setAttachmentsByMessage(cached.attachmentsByMessage);
      setReactionsByMessage(cached.reactionsByMessage);
      setProfilesById(cached.profilesById);
      setIsChatLoading(false);
    };

    void hydrateChatCache();

    return () => {
      isCancelled = true;
    };
  }, [socialChatCacheKey]);

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

    if (messages.length === 0 && threads.length === 0) {
      setIsChatLoading(true);
    }
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
        .createSignedUrls(attachmentPaths, CHAT_MEDIA_SIGNED_URL_TTL_SECONDS);

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
  }, [activeChannelId, messages.length, supabase, threads.length]);

  useEffect(() => {
    void loadChatData();
  }, [loadChatData]);

  useEffect(() => {
    if (!socialOverviewCacheKey) return;

    const persistTimeout = setTimeout(() => {
      void writeCachedValue<SocialOverviewCachePayload>(
        socialOverviewCacheKey,
        {
          activeChannelId,
          channels,
          cityId,
          cityName,
          eventAttendeesByEvent,
          eventOrganizersById,
          events,
          joinedTeamIds,
          teamMemberCountById,
          teams,
        },
      );
    }, 220);

    return () => {
      clearTimeout(persistTimeout);
    };
  }, [
    activeChannelId,
    channels,
    cityId,
    cityName,
    eventAttendeesByEvent,
    eventOrganizersById,
    events,
    joinedTeamIds,
    socialOverviewCacheKey,
    teamMemberCountById,
    teams,
  ]);

  useEffect(() => {
    if (!socialChatCacheKey) return;

    const persistTimeout = setTimeout(() => {
      const cachedMessages = messages.slice(-180);
      const cachedThreads = threads.slice(0, 80);
      const relevantProfileIds = new Set<string>();
      const messageIds = new Set<string>();

      for (const message of cachedMessages) {
        messageIds.add(message.id);
        if (message.sender_id) relevantProfileIds.add(message.sender_id);
      }
      for (const thread of cachedThreads) {
        if (thread.created_by) relevantProfileIds.add(thread.created_by);
      }

      const cachedAttachmentsByMessage: Record<string, ChatAttachmentRow[]> =
        {};
      const cachedReactionsByMessage: Record<string, ChatReactionRow[]> = {};
      const cachedProfilesById: Record<string, PublicProfileRow> = {};

      for (const messageId of messageIds) {
        const attachments = attachmentsByMessage[messageId];
        if (attachments?.length) {
          cachedAttachmentsByMessage[messageId] = attachments.slice(0, 8);
        }

        const reactions = reactionsByMessage[messageId];
        if (reactions?.length) {
          cachedReactionsByMessage[messageId] = reactions.slice(0, 20);
          for (const reaction of reactions) {
            if (reaction.user_id) relevantProfileIds.add(reaction.user_id);
          }
        }
      }

      for (const profileId of relevantProfileIds) {
        const profile = profilesById[profileId];
        if (profile) {
          cachedProfilesById[profileId] = profile;
        }
      }

      void writeCachedValue<SocialChatCachePayload>(socialChatCacheKey, {
        attachmentsByMessage: cachedAttachmentsByMessage,
        messages: cachedMessages,
        profilesById: cachedProfilesById,
        reactionsByMessage: cachedReactionsByMessage,
        threads: cachedThreads,
      });
    }, 220);

    return () => {
      clearTimeout(persistTimeout);
    };
  }, [
    attachmentsByMessage,
    messages,
    profilesById,
    reactionsByMessage,
    socialChatCacheKey,
    threads,
  ]);

  const ensureProfiles = useCallback(
    async (nextProfileIds: string[]) => {
      const unique = Array.from(new Set(nextProfileIds.filter(Boolean)));
      const missing = unique.filter((id) => !profilesByIdRef.current[id]);
      if (missing.length === 0) return;

      const { data, error } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", missing);

      if (error) {
        console.error("Could not load profiles", error);
        return;
      }

      const rows = (data ?? []) as PublicProfileRow[];
      if (rows.length === 0) return;

      setProfilesById((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          next[row.id] = row;
        }
        return next;
      });
    },
    [supabase],
  );

  const ensureSignedAttachmentUrl = useCallback(
    async (storagePath: string) => {
      const path = storagePath.trim();
      if (!path) return;
      if (signedAttachmentUrlsRef.current[path]) return;

      const { data, error } = await supabase.storage
        .from("chat-media")
        .createSignedUrl(path, CHAT_MEDIA_SIGNED_URL_TTL_SECONDS);

      if (error) {
        console.error("Could not sign attachment url", error);
        return;
      }

      if (data?.signedUrl) {
        setSignedAttachmentUrls((previous) => ({
          ...previous,
          [path]: data.signedUrl,
        }));
      }
    },
    [supabase],
  );

  const upsertMessageInState = useCallback((nextMessage: ChatMessageRow) => {
    if (nextMessage.deleted_at) {
      setMessages((previous) =>
        previous.filter((message) => message.id !== nextMessage.id),
      );
      return;
    }

    setMessages((previous) => {
      const index = previous.findIndex(
        (message) => message.id === nextMessage.id,
      );
      const updated =
        index === -1
          ? [...previous, nextMessage]
          : previous.map((message) =>
              message.id === nextMessage.id ? nextMessage : message,
            );

      updated.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return updated.length > 250
        ? updated.slice(updated.length - 250)
        : updated;
    });
  }, []);

  const removeMessageFromState = useCallback((messageId: string) => {
    setMessages((previous) =>
      previous.filter((message) => message.id !== messageId),
    );

    setAttachmentsByMessage((previous) => {
      if (!previous[messageId]) return previous;
      const next = { ...previous };
      delete next[messageId];
      return next;
    });

    setReactionsByMessage((previous) => {
      if (!previous[messageId]) return previous;
      const next = { ...previous };
      delete next[messageId];
      return next;
    });

    const attachmentPaths = (attachmentsByMessageRef.current[messageId] ?? [])
      .filter((attachment) => attachment.storage_bucket === "chat-media")
      .map((attachment) => attachment.storage_path);

    if (attachmentPaths.length > 0) {
      setSignedAttachmentUrls((previous) => {
        let next: Record<string, string> | null = null;
        for (const path of attachmentPaths) {
          if (!previous[path]) continue;
          if (!next) next = { ...previous };
          delete next[path];
        }
        return next ?? previous;
      });
    }

    setReplyToMessageId((previous) =>
      previous === messageId ? null : previous,
    );
    setSelectedMessageId((previous) =>
      previous === messageId ? null : previous,
    );
  }, []);

  const upsertThreadInState = useCallback((nextThread: ChatThreadRow) => {
    if (nextThread.archived_at) {
      setThreads((previous) =>
        previous.filter((thread) => thread.id !== nextThread.id),
      );
      return;
    }

    setThreads((previous) => {
      const index = previous.findIndex((thread) => thread.id === nextThread.id);
      const updated =
        index === -1
          ? [...previous, nextThread]
          : previous.map((thread) =>
              thread.id === nextThread.id ? nextThread : thread,
            );
      updated.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return updated.length > 60 ? updated.slice(0, 60) : updated;
    });
  }, []);

  const removeThreadFromState = useCallback((threadId: string) => {
    setThreads((previous) =>
      previous.filter((thread) => thread.id !== threadId),
    );
    setActiveThreadId((previous) => (previous === threadId ? null : previous));
  }, []);

  const upsertAttachmentInState = useCallback(
    (attachment: ChatAttachmentRow) => {
      setAttachmentsByMessage((previous) => {
        const list = previous[attachment.message_id] ?? [];
        const index = list.findIndex((item) => item.id === attachment.id);
        const nextList =
          index === -1
            ? [...list, attachment]
            : list.map((item) =>
                item.id === attachment.id ? attachment : item,
              );
        nextList.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { ...previous, [attachment.message_id]: nextList };
      });

      if (attachment.storage_bucket === "chat-media") {
        void ensureSignedAttachmentUrl(attachment.storage_path);
      }
    },
    [ensureSignedAttachmentUrl],
  );

  const removeAttachmentInState = useCallback(
    (attachment: ChatAttachmentRow) => {
      setAttachmentsByMessage((previous) => {
        const list = previous[attachment.message_id];
        if (!list) return previous;
        const nextList = list.filter((item) => item.id !== attachment.id);
        const next = { ...previous };
        if (nextList.length === 0) {
          delete next[attachment.message_id];
        } else {
          next[attachment.message_id] = nextList;
        }
        return next;
      });

      if (attachment.storage_bucket === "chat-media") {
        const path = attachment.storage_path;
        setSignedAttachmentUrls((previous) => {
          if (!previous[path]) return previous;
          const next = { ...previous };
          delete next[path];
          return next;
        });
      }
    },
    [],
  );

  const upsertReactionInState = useCallback((reaction: ChatReactionRow) => {
    setReactionsByMessage((previous) => {
      const list = previous[reaction.message_id] ?? [];
      const exists = list.some(
        (item) =>
          item.user_id === reaction.user_id && item.emoji === reaction.emoji,
      );
      if (exists) return previous;
      return { ...previous, [reaction.message_id]: [...list, reaction] };
    });
  }, []);

  const removeReactionInState = useCallback(
    (reaction: Pick<ChatReactionRow, "message_id" | "user_id" | "emoji">) => {
      setReactionsByMessage((previous) => {
        const list = previous[reaction.message_id];
        if (!list) return previous;
        const nextList = list.filter(
          (item) =>
            !(
              item.user_id === reaction.user_id && item.emoji === reaction.emoji
            ),
        );
        const next = { ...previous };
        if (nextList.length === 0) {
          delete next[reaction.message_id];
        } else {
          next[reaction.message_id] = nextList;
        }
        return next;
      });
    },
    [],
  );

  const hydrateMessageDetails = useCallback(
    async (messageId: string) => {
      const id = messageId.trim();
      if (!id) return;

      const [
        { data: attachmentRows, error: attachmentsError },
        { data: reactionRows, error: reactionsError },
      ] = await Promise.all([
        supabase
          .from("chat_message_attachments")
          .select(
            "id, message_id, kind, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, uploaded_by, created_at",
          )
          .eq("message_id", id),
        supabase
          .from("chat_message_reactions")
          .select("message_id, user_id, emoji, created_at")
          .eq("message_id", id),
      ]);

      if (attachmentsError || reactionsError) {
        console.error("Could not hydrate message details", {
          attachmentsError,
          reactionsError,
        });
        return;
      }

      const attachments = (attachmentRows ?? []) as ChatAttachmentRow[];
      const reactions = (reactionRows ?? []) as ChatReactionRow[];

      attachments.forEach((row) => upsertAttachmentInState(row));
      reactions.forEach((row) => upsertReactionInState(row));

      const profileIds = Array.from(
        new Set([
          ...attachments.map((row) => row.uploaded_by),
          ...reactions.map((row) => row.user_id),
        ]),
      );
      void ensureProfiles(profileIds);
    },
    [ensureProfiles, supabase, upsertAttachmentInState, upsertReactionInState],
  );

  const scheduleHydrateMediaMessage = useCallback(
    (message: ChatMessageRow) => {
      if (!message?.id) return;
      if (message.kind !== "image" && message.kind !== "gif") return;
      if (messageHydrationTimersRef.current[message.id]) return;

      messageHydrationTimersRef.current[message.id] = setTimeout(() => {
        delete messageHydrationTimersRef.current[message.id];

        if (!messageIdSetRef.current.has(message.id)) return;
        const hasAttachments =
          (attachmentsByMessageRef.current[message.id] ?? []).length > 0;

        if (!hasAttachments) {
          void hydrateMessageDetails(message.id);
        }
      }, 650);
    },
    [hydrateMessageDetails],
  );

  useEffect(() => {
    const messageIds = new Set(messages.map((message) => message.id));

    for (const [messageId, rows] of Object.entries(
      pendingAttachmentsRef.current,
    )) {
      if (!messageIds.has(messageId)) continue;
      delete pendingAttachmentsRef.current[messageId];
      rows.forEach((attachment) => upsertAttachmentInState(attachment));
    }

    for (const [messageId, rows] of Object.entries(
      pendingReactionsRef.current,
    )) {
      if (!messageIds.has(messageId)) continue;
      delete pendingReactionsRef.current[messageId];
      rows.forEach((reaction) => upsertReactionInState(reaction));
    }
  }, [messages, upsertAttachmentInState, upsertReactionInState]);

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
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          if (eventType === "DELETE") {
            const oldRow = payload.old as ChatMessageRow;
            if (oldRow?.id) {
              removeMessageFromState(oldRow.id);
            }
            return;
          }

          const row = payload.new as ChatMessageRow;
          if (!row?.id) return;

          if (row.deleted_at) {
            removeMessageFromState(row.id);
            return;
          }

          upsertMessageInState(row);
          void ensureProfiles([row.sender_id]);
          if (eventType === "INSERT") {
            scheduleHydrateMediaMessage(row);
          }
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
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          if (eventType === "DELETE") {
            const oldRow = payload.old as ChatThreadRow;
            if (oldRow?.id) {
              removeThreadFromState(oldRow.id);
            }
            return;
          }

          const row = payload.new as ChatThreadRow;
          if (!row?.id) return;

          if (row.archived_at) {
            removeThreadFromState(row.id);
            return;
          }

          upsertThreadInState(row);
          void ensureProfiles([row.created_by]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_attachments",
        },
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (eventType === "DELETE" ? payload.old : payload.new) as
            | ChatAttachmentRow
            | undefined;

          if (!row?.message_id) return;

          const isKnownMessage = messageIdSetRef.current.has(row.message_id);
          if (!isKnownMessage) {
            if (eventType === "DELETE") return;

            const pending = pendingAttachmentsRef.current[row.message_id] ?? [];
            const exists = pending.some((item) => item.id === row.id);
            if (!exists) {
              pendingAttachmentsRef.current[row.message_id] = [...pending, row];
              if (Object.keys(pendingAttachmentsRef.current).length > 200) {
                pendingAttachmentsRef.current = {};
              }
            }
            return;
          }

          if (eventType === "DELETE") {
            removeAttachmentInState(row);
          } else {
            upsertAttachmentInState(row);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
        },
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (eventType === "DELETE" ? payload.old : payload.new) as
            | ChatReactionRow
            | undefined;

          if (!row?.message_id) return;

          const isKnownMessage = messageIdSetRef.current.has(row.message_id);
          if (!isKnownMessage) {
            if (eventType === "DELETE") return;

            const pending = pendingReactionsRef.current[row.message_id] ?? [];
            const exists = pending.some(
              (item) =>
                item.user_id === row.user_id && item.emoji === row.emoji,
            );
            if (!exists) {
              pendingReactionsRef.current[row.message_id] = [...pending, row];
              if (Object.keys(pendingReactionsRef.current).length > 200) {
                pendingReactionsRef.current = {};
              }
            }
            return;
          }

          if (eventType === "DELETE") {
            removeReactionInState(row);
          } else {
            upsertReactionInState(row);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    activeChannelId,
    ensureProfiles,
    scheduleHydrateMediaMessage,
    removeAttachmentInState,
    removeMessageFromState,
    removeReactionInState,
    removeThreadFromState,
    supabase,
    upsertAttachmentInState,
    upsertMessageInState,
    upsertReactionInState,
    upsertThreadInState,
  ]);

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

  const visibleMessages = useMemo(
    () =>
      messages.filter((message) =>
        activeThreadId
          ? message.thread_id === activeThreadId
          : message.thread_id === null,
      ),
    [messages, activeThreadId],
  );
  const scrollChatToBottom = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      chatFeedScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);
  useEffect(() => {
    shouldAutoScrollChatRef.current = activeTab === "chat";
  }, [activeChannelId, activeThreadId, activeTab]);
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

  const [myUpcomingEvents, otherUpcomingEvents] = useMemo(() => {
    const mine: EventRow[] = [];
    const other: EventRow[] = [];

    for (const event of upcomingEvents) {
      const isMine =
        !!myEventAttendanceByEvent[event.id] || event.created_by === userId;
      if (isMine) {
        mine.push(event);
      } else {
        other.push(event);
      }
    }

    return [mine, other] as const;
  }, [myEventAttendanceByEvent, upcomingEvents, userId]);

  const [joinedTeams, availableTeams] = useMemo(() => {
    const joined = new Set(joinedTeamIds);
    const mine: TeamRow[] = [];
    const other: TeamRow[] = [];

    for (const team of teams) {
      if (joined.has(team.id)) {
        mine.push(team);
      } else {
        other.push(team);
      }
    }

    return [mine, other] as const;
  }, [joinedTeamIds, teams]);

  const invalidateMembershipDependentCache = useCallback(async () => {
    if (!userId) return;

    const knownChannelIds = Array.from(
      new Set([
        ...channels.map((channel) => channel.id),
        ...Object.keys(attachmentsByMessage),
      ]),
    );

    await Promise.all([
      removeCachedValue(`home:dashboard:${userId}`),
      removeCachedValue(`social:overview:${userId}`),
      removeCachedValuesByPrefix(`social:chat:${userId}:`),
      ...knownChannelIds.map((channelId) =>
        removeCachedValue(`social:chat:${userId}:${channelId}`),
      ),
    ]);
  }, [attachmentsByMessage, channels, userId]);

  const switchTeam = async (teamId: string) => {
    if (!userId || isWorkingTeamId) return;
    setErrorMessage("");
    setIsWorkingTeamId(teamId);

    const { error: clearError } = await supabase
      .from("team_memberships")
      .delete()
      .eq("user_id", userId);

    if (clearError) {
      setErrorMessage(clearError.message);
      setIsWorkingTeamId(null);
      return;
    }

    const { error: joinError } = await supabase
      .from("team_memberships")
      .insert({ user_id: userId, team_id: teamId });

    if (joinError) {
      setErrorMessage(joinError.message);
      await invalidateMembershipDependentCache();
      await loadSocialData();
      setIsWorkingTeamId(null);
      return;
    }

    await invalidateMembershipDependentCache();
    await loadSocialData();
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

    await invalidateMembershipDependentCache();
    await loadSocialData();
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

    const { error: clearMembershipsError } = await supabase
      .from("team_memberships")
      .delete()
      .eq("user_id", userId);

    if (clearMembershipsError) {
      setErrorMessage(getFriendlyErrorMessage(clearMembershipsError.message));
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
      await invalidateMembershipDependentCache();
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
    setTeamMemberCountById((previous) => ({
      ...previous,
      [createdTeam.id]: Math.max(1, previous[createdTeam.id] ?? 0),
    }));
    setNewTeamName("");
    setNewTeamDescription("");
    setIsCreateOpen(false);
    setIsCreatingTeam(false);
    await invalidateMembershipDependentCache();
    await loadSocialData();
  };

  const resetCreateEventDrafts = () => {
    const nextWindow = makeDefaultEventWindowDrafts();
    setNewEventTitle("");
    setNewEventActivityType("community");
    setNewEventDescription("");
    setNewEventLocationName("");
    setNewEventLocationAddress("");
    setNewEventLatitude(null);
    setNewEventLongitude(null);
    setNewEventLocationNotes("");
    setNewEventStartsAt(nextWindow.startsAtDraft);
    setNewEventEndsAt(nextWindow.endsAtDraft);
    setNewEventSignUpDeadline("");
    setNewEventMaxAttendees("");
    setLocationSuggestions([]);
    setIsLocationSuggestionListOpen(false);
  };

  const closeEventEditor = () => {
    setIsEventEditorOpen(false);
    setEditingEvent(null);
    setIsSavingEventEdits(false);
  };

  const openEventEditor = (event: EventRow) => {
    if (!userId || event.created_by !== userId) return;

    setErrorMessage("");
    setIsCreateEventOpen(false);
    setEditingEvent(event);
    setEditEventTitle(event.title);
    setEditEventActivityType(event.activity_type);
    setEditEventDescription(event.description ?? "");
    setEditEventLocationName(event.location_name);
    setEditEventLocationAddress(event.location_address ?? "");
    setEditEventLocationNotes(event.location_notes ?? "");
    setEditEventStartsAt(toEventDateTimeDraft(new Date(event.starts_at)));
    setEditEventEndsAt(toEventDateTimeDraft(new Date(event.ends_at)));
    setEditEventSignUpDeadline(
      event.sign_up_deadline
        ? toEventDateTimeDraft(new Date(event.sign_up_deadline))
        : "",
    );
    setEditEventMaxAttendees(
      typeof event.max_attendees === "number"
        ? String(event.max_attendees)
        : "",
    );
    setIsEventEditorOpen(true);
  };

  const saveEventEdits = async () => {
    if (!userId || !cityId || !editingEvent || isSavingEventEdits) return;
    if (editingEvent.created_by !== userId) return;

    const title = editEventTitle.trim();
    const activityType = editEventActivityType.trim() || "community";
    const description = editEventDescription.trim();
    const locationName = editEventLocationName.trim();
    const locationAddress = editEventLocationAddress.trim();
    const locationNotes = editEventLocationNotes.trim();
    const signUpDeadlineText = editEventSignUpDeadline.trim();
    const maxAttendeesText = editEventMaxAttendees.trim();

    if (!title) {
      setErrorMessage("Event title is required.");
      return;
    }

    if (!locationName) {
      setErrorMessage("Location name is required.");
      return;
    }

    const startsAt = parseEventDateTime(editEventStartsAt);
    const endsAt = parseEventDateTime(editEventEndsAt);

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
    setIsSavingEventEdits(true);

    const nextStartsAt = startsAt.toISOString();
    const nextEndsAt = endsAt.toISOString();
    const nextSignUpDeadline = signUpDeadline?.toISOString() ?? null;

    const { error } = await supabase
      .from("events")
      .update({
        title,
        description: description || null,
        activity_type: activityType,
        location_name: locationName,
        location_address: locationAddress || null,
        location_notes: locationNotes || null,
        starts_at: nextStartsAt,
        ends_at: nextEndsAt,
        sign_up_deadline: nextSignUpDeadline,
        max_attendees: maxAttendees,
      })
      .eq("id", editingEvent.id)
      .eq("created_by", userId);

    if (error) {
      setErrorMessage(getFriendlyEventErrorMessage(error.message));
      setIsSavingEventEdits(false);
      return;
    }

    setEvents((previous) => {
      const updated = previous.map((event) =>
        event.id === editingEvent.id
          ? {
              ...event,
              title,
              description: description || null,
              activity_type: activityType,
              location_name: locationName,
              location_address: locationAddress || null,
              location_notes: locationNotes || null,
              starts_at: nextStartsAt,
              ends_at: nextEndsAt,
              sign_up_deadline: nextSignUpDeadline,
              max_attendees: maxAttendees,
            }
          : event,
      );

      updated.sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
      return updated;
    });

    closeEventEditor();
  };

  const createEvent = async () => {
    if (!userId || !cityId || isCreatingEvent) return;

    const title = newEventTitle.trim();
    const activityType = newEventActivityType.trim() || "community";
    const description = newEventDescription.trim();
    const locationName = newEventLocationName.trim();
    const locationAddress = newEventLocationAddress.trim();
    const locationLatitude = newEventLatitude;
    const locationLongitude = newEventLongitude;
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
      latitude: locationLatitude,
      longitude: locationLongitude,
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

    // Optimistic UI update (realtime will converge state afterwards).
    if (hasReaction) {
      removeReactionInState({ message_id: messageId, user_id: userId, emoji });
    } else {
      upsertReactionInState({
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      });
    }

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
      // Revert optimistic update on failure.
      if (hasReaction) {
        upsertReactionInState({
          message_id: messageId,
          user_id: userId,
          emoji,
          created_at: new Date().toISOString(),
        });
      } else {
        removeReactionInState({
          message_id: messageId,
          user_id: userId,
          emoji,
        });
      }
      return;
    }
  };

  const deleteMyMessage = async (message: ChatMessageRow) => {
    if (!userId || message.sender_id !== userId) return;

    setErrorMessage("");

    // Optimistically remove from UI. If the request fails we refresh as fallback.
    removeMessageFromState(message.id);

    const attachmentPaths = (attachmentsByMessage[message.id] ?? [])
      .filter((attachment) => attachment.storage_bucket === "chat-media")
      .map((attachment) => attachment.storage_path);

    if (attachmentPaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("chat-media")
        .remove(attachmentPaths);

      if (storageError) {
        console.error("Failed to remove chat-media attachments", storageError);
      }
    }

    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", message.id)
      .eq("sender_id", userId);

    if (error) {
      setErrorMessage(error.message);
      void loadChatData();
      return;
    }
  };

  const openMessageActions = (message: ChatMessageRow) => {
    setSelectedMessageId(message.id);
    setIsReactionPickerOpen(true);
  };

  const sendComposer = async () => {
    if (isChatComposeDisabled) {
      setErrorMessage("Typing is disabled on web on phone.");
      return;
    }

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

      const threadId = data?.[0]?.thread_id ?? null;
      const rootMessageId = data?.[0]?.root_message_id ?? null;
      setActiveThreadId(threadId);
      if (threadId) {
        upsertThreadInState({
          id: threadId,
          title: threadTitleDraft.trim() || null,
          channel_id: activeChannelId,
          created_by: userId,
          created_at: new Date().toISOString(),
          archived_at: null,
        });
      }
      if (rootMessageId && threadId) {
        upsertMessageInState({
          id: rootMessageId,
          channel_id: activeChannelId,
          thread_id: threadId,
          sender_id: userId,
          reply_to_message_id: null,
          kind: "text",
          body: textBody,
          metadata: {},
          created_at: new Date().toISOString(),
          deleted_at: null,
        });
      }
    } else {
      const { data: messageId, error } = await supabase.rpc(
        "chat_send_message",
        {
          p_channel_id: activeChannelId,
          p_body: textBody,
          p_kind: "text",
          p_thread_id: activeThreadId ?? null,
          p_reply_to_message_id: replyToMessageId ?? null,
        },
      );

      if (error) {
        setErrorMessage(error.message);
        setIsSendingMessage(false);
        return;
      }

      if (messageId) {
        upsertMessageInState({
          id: messageId,
          channel_id: activeChannelId,
          thread_id: activeThreadId ?? null,
          sender_id: userId,
          reply_to_message_id: replyToMessageId ?? null,
          kind: "text",
          body: textBody,
          metadata: {},
          created_at: new Date().toISOString(),
          deleted_at: null,
        });
      }
    }

    setComposerText("");
    setReplyToMessageId(null);
    setThreadTitleDraft("");
    setIsThreadMode(false);
    setIsSendingMessage(false);
  };

  const uploadKeyboardMediaMessage = async (
    event: KeyboardImageChangeEvent,
  ) => {
    if (isChatComposeDisabled) {
      setErrorMessage("Typing is disabled on web on phone.");
      return;
    }

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

      const { data: insertedAttachment, error: attachmentError } =
        await supabase
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
          })
          .select(
            "id, message_id, kind, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, uploaded_by, created_at",
          )
          .single();

      if (attachmentError) {
        setErrorMessage(attachmentError.message);
        setIsUploadingImage(false);
        return;
      }

      upsertMessageInState({
        id: messageId,
        channel_id: activeChannelId,
        thread_id: activeThreadId ?? null,
        sender_id: userId,
        reply_to_message_id: replyToMessageId ?? null,
        kind: attachmentKind,
        body: composerText.trim() || null,
        metadata,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      if (insertedAttachment) {
        upsertAttachmentInState(insertedAttachment as ChatAttachmentRow);
      } else {
        upsertAttachmentInState({
          id: `local-${messageId}`,
          message_id: messageId,
          uploaded_by: userId,
          kind: attachmentKind,
          storage_bucket: "chat-media",
          storage_path: storagePath,
          mime_type: mimeType,
          file_size_bytes: Math.max(1, mediaBytes.byteLength),
          width: null,
          height: null,
          created_at: new Date().toISOString(),
        });
      }

      setComposerText("");
      setReplyToMessageId(null);
      setThreadTitleDraft("");
      setIsThreadMode(false);
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

  const uploadWebFileMessage = useCallback(
    async (file: File) => {
      if (isChatComposeDisabled) {
        setErrorMessage("Typing is disabled on web on phone.");
        return;
      }

      if (Platform.OS !== "web") return;
      if (!activeChannelId || !userId || isUploadingImage || isSendingMessage) {
        return;
      }

      const mimeType = (file.type || "application/octet-stream").toLowerCase();
      const attachmentKind = mimeType.includes("gif")
        ? ("gif" as const)
        : mimeType.startsWith("image/")
          ? ("image" as const)
          : null;

      if (!attachmentKind) {
        setErrorMessage("Only images (including GIFs) are supported here.");
        return;
      }

      setErrorMessage("");
      setIsUploadingImage(true);

      try {
        const sanitizedFile = await sanitizeWebImageForUpload(file);
        const uploadMimeType = sanitizedFile.mimeType || mimeType;
        const extension = getFileExtension(
          file.name || "upload",
          uploadMimeType,
        );
        const storagePath = `${activeChannelId}/${userId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(storagePath, sanitizedFile.body, {
            cacheControl: "3600",
            upsert: false,
            contentType: uploadMimeType,
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
            p_kind: attachmentKind,
            p_thread_id: activeThreadId ?? null,
            p_reply_to_message_id: replyToMessageId ?? null,
            p_metadata: {},
          },
        );

        if (messageError || !messageId) {
          setErrorMessage(
            messageError?.message ?? "Could not create media message.",
          );
          setIsUploadingImage(false);
          return;
        }

        const { data: insertedAttachment, error: attachmentError } =
          await supabase
            .from("chat_message_attachments")
            .insert({
              message_id: messageId,
              uploaded_by: userId,
              kind: attachmentKind,
              storage_bucket: "chat-media",
              storage_path: storagePath,
              mime_type: uploadMimeType,
              file_size_bytes: sanitizedFile.size,
              width: null,
              height: null,
            })
            .select(
              "id, message_id, kind, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, uploaded_by, created_at",
            )
            .single();

        if (attachmentError) {
          setErrorMessage(attachmentError.message);
          setIsUploadingImage(false);
          return;
        }

        upsertMessageInState({
          id: messageId,
          channel_id: activeChannelId,
          thread_id: activeThreadId ?? null,
          sender_id: userId,
          reply_to_message_id: replyToMessageId ?? null,
          kind: attachmentKind,
          body: composerText.trim() || null,
          metadata: {},
          created_at: new Date().toISOString(),
          deleted_at: null,
        });

        if (insertedAttachment) {
          upsertAttachmentInState(insertedAttachment as ChatAttachmentRow);
        } else {
          upsertAttachmentInState({
            id: `local-${messageId}`,
            message_id: messageId,
            uploaded_by: userId,
            kind: attachmentKind,
            storage_bucket: "chat-media",
            storage_path: storagePath,
            mime_type: uploadMimeType,
            file_size_bytes: sanitizedFile.size,
            width: null,
            height: null,
            created_at: new Date().toISOString(),
          });
        }

        setComposerText("");
        setReplyToMessageId(null);
        setThreadTitleDraft("");
        setIsThreadMode(false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not upload image.",
        );
      } finally {
        setIsUploadingImage(false);
      }
    },
    [
      activeChannelId,
      activeThreadId,
      composerText,
      isChatComposeDisabled,
      isSendingMessage,
      isUploadingImage,
      replyToMessageId,
      supabase,
      upsertAttachmentInState,
      upsertMessageInState,
      userId,
    ],
  );

  const handleWebComposerPaste = useCallback(
    (event: any) => {
      if (Platform.OS !== "web") return;

      const clipboardData =
        event?.clipboardData ?? event?.nativeEvent?.clipboardData;

      const files: FileList | undefined = clipboardData?.files;
      const firstFile = files && files.length ? files[0] : null;
      if (firstFile) {
        event?.preventDefault?.();
        void uploadWebFileMessage(firstFile);
        return;
      }

      const items = clipboardData?.items;
      if (!items || typeof items.length !== "number") return;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item) continue;
        if (item.kind !== "file") continue;
        if (typeof item.type !== "string") continue;
        if (!item.type.startsWith("image/")) continue;

        const file = item.getAsFile?.();
        if (!file) continue;
        event?.preventDefault?.();
        void uploadWebFileMessage(file);
        return;
      }
    },
    [uploadWebFileMessage],
  );

  const handleWebComposerDrop = useCallback(
    (event: any) => {
      if (Platform.OS !== "web") return;
      const dataTransfer =
        event?.dataTransfer ?? event?.nativeEvent?.dataTransfer;
      const file: File | undefined = dataTransfer?.files?.[0];
      if (!file) return;
      event?.preventDefault?.();
      void uploadWebFileMessage(file);
    },
    [uploadWebFileMessage],
  );

  const handleWebComposerDragOver = useCallback((event: any) => {
    if (Platform.OS !== "web") return;
    // Required to allow dropping files without the browser navigating away.
    event?.preventDefault?.();
  }, []);

  const uploadImageMessage = async () => {
    if (isChatComposeDisabled) {
      setErrorMessage("Typing is disabled on web on phone.");
      return;
    }

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
      base64: true,
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
      const imageBody =
        asset.base64 && asset.base64.trim().length > 0
          ? base64ToUint8Array(asset.base64)
          : await readImageUriAsBlob(asset.uri);

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, imageBody, {
          cacheControl: "3600",
          upsert: false,
          contentType: mimeType,
        });

      if (uploadError) {
        const normalizedMessage = uploadError.message.toLowerCase();
        if (
          normalizedMessage.includes("bucket") &&
          normalizedMessage.includes("not found")
        ) {
          setErrorMessage(
            "Supabase bucket `chat-media` is missing. Run chat storage migration and try again.",
          );
        } else {
          setErrorMessage(uploadError.message);
        }
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

      const { data: insertedAttachment, error: attachmentError } =
        await supabase
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
              Math.round(
                asset.fileSize ??
                  (imageBody instanceof Blob
                    ? imageBody.size
                    : imageBody.byteLength) ??
                  1,
              ),
            ),
            width: asset.width ?? null,
            height: asset.height ?? null,
          })
          .select(
            "id, message_id, kind, storage_bucket, storage_path, mime_type, file_size_bytes, width, height, uploaded_by, created_at",
          )
          .single();

      if (attachmentError) {
        setErrorMessage(attachmentError.message);
        setIsUploadingImage(false);
        return;
      }

      upsertMessageInState({
        id: messageId,
        channel_id: activeChannelId,
        thread_id: activeThreadId ?? null,
        sender_id: userId,
        reply_to_message_id: replyToMessageId ?? null,
        kind: "image",
        body: composerText.trim() || null,
        metadata: {},
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      if (insertedAttachment) {
        upsertAttachmentInState(insertedAttachment as ChatAttachmentRow);
      } else {
        upsertAttachmentInState({
          id: `local-${messageId}`,
          message_id: messageId,
          uploaded_by: userId,
          kind: "image",
          storage_bucket: "chat-media",
          storage_path: storagePath,
          mime_type: mimeType,
          file_size_bytes: Math.max(
            1,
            Math.round(
              asset.fileSize ??
                (imageBody instanceof Blob
                  ? imageBody.size
                  : imageBody.byteLength) ??
                1,
            ),
          ),
          width: asset.width ?? null,
          height: asset.height ?? null,
          created_at: new Date().toISOString(),
        });
      }

      setComposerText("");
      setReplyToMessageId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("network request failed")) {
        setErrorMessage(
          "Could not upload image due to a network error. Check connection and Supabase URL.",
        );
      } else if (message.includes("could not read image")) {
        setErrorMessage(
          "Could not read image file on this device. Please try another image.",
        );
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not upload image.",
        );
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openEventLocationInMaps = useCallback(async (event: EventRow) => {
    const url = buildGoogleMapsUrl(event);
    if (!url) {
      setErrorMessage("This event is missing a location link.");
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        setErrorMessage("Could not open Google Maps for this location.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      setErrorMessage("Could not open Google Maps for this location.");
    }
  }, []);

  const renderEventCard = (event: EventRow) => {
    const attendeeSummary = eventAttendeeSummaryByEvent[event.id] || {
      going: 0,
      waitlist: 0,
    };
    const myAttendance = myEventAttendanceByEvent[event.id];
    const isCreator = event.created_by === userId;
    const organizer = eventOrganizersById[event.created_by];
    const organizerName =
      organizer?.display_name?.trim() || (isCreator ? "You" : "Member");

    return (
      <View key={event.id} style={styles.eventCard}>
        <View style={styles.eventCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventCardTitle}>{event.title}</Text>
            <Text style={styles.eventCardType}>{event.activity_type}</Text>
            <Text style={styles.eventCardHost}>Hosted by {organizerName}</Text>
          </View>
          {event.is_cancelled && (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledBadgeText}>Cancelled</Text>
            </View>
          )}
        </View>

        <View style={styles.eventInfoRow}>
          <Ionicons name="time-outline" size={14} color={COLORS.primary} />
          <Text style={styles.eventInfoText}>
            {formatEventWindow(event.starts_at, event.ends_at)}
          </Text>
        </View>
        <Pressable
          onPress={() => void openEventLocationInMaps(event)}
          style={[styles.eventInfoRow, styles.eventLocationLink]}
        >
          <Ionicons name="location-outline" size={14} color={COLORS.primary} />
          <View style={styles.eventLocationTextWrap}>
            <Text style={styles.eventInfoText}>{event.location_name}</Text>
            {!!event.location_address && (
              <Text style={styles.eventLocationAddressText} numberOfLines={1}>
                {event.location_address}
              </Text>
            )}
            <Text style={styles.eventLocationHintText}>
              Open in Google Maps
            </Text>
          </View>
        </Pressable>

        {event.description && (
          <Text style={styles.eventCardDesc} numberOfLines={2}>
            {event.description}
          </Text>
        )}

        <View style={styles.eventFooter}>
          <View style={styles.attendeePill}>
            <Text style={styles.attendeePillText}>
              {event.max_attendees
                ? `${attendeeSummary.going}/${event.max_attendees} Going`
                : `${attendeeSummary.going} Going`}
            </Text>
          </View>

          <View style={styles.eventActions}>
            {myAttendance ? (
              <Pressable
                onPress={() => void leaveEvent(event.id)}
                style={styles.leaveButton}
              >
                <Text style={styles.leaveButtonText}>Leave</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void upsertEventAttendance(event.id, "going")}
                style={styles.joinButton}
              >
                <Text style={styles.joinButtonText}>Join</Text>
              </Pressable>
            )}

            {isCreator && (
              <Pressable
                onPress={() => openEventEditor(event)}
                style={styles.adminButton}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={COLORS.secondary}
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderTeamCard = (team: TeamRow) => {
    const isJoined = joinedTeamIds.includes(team.id);
    const memberCount = teamMemberCountById[team.id];
    const memberLabel =
      typeof memberCount === "number" ? `${memberCount} members` : "Members...";

    return (
      <View key={team.id} style={styles.teamCard}>
        <View style={styles.teamIcon}>
          <Ionicons name="people" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>{memberLabel}</Text>
          {team.description && (
            <Text style={styles.teamDesc} numberOfLines={1}>
              {team.description}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => (isJoined ? leaveTeam(team.id) : switchTeam(team.id))}
          style={[styles.teamActionBtn, isJoined && styles.teamActionBtnJoined]}
        >
          <Text
            style={[
              styles.teamActionBtnText,
              isJoined && styles.teamActionBtnTextJoined,
            ]}
          >
            {isJoined ? "Leave" : joinedTeamIds.length > 0 ? "Switch" : "Join"}
          </Text>
        </Pressable>
      </View>
    );
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
            <Text style={styles.subtitle}>{cityName || "Global Root"}</Text>
          </View>
        </View>

        {activeTab === "groups" && (
          <Pressable
            disabled={!cityId}
            onPress={() => {
              LayoutAnimation.configureNext(
                LayoutAnimation.Presets.easeInEaseOut,
              );
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
              LayoutAnimation.configureNext(
                LayoutAnimation.Presets.easeInEaseOut,
              );
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
          <BlurView
            intensity={30}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.tabBar}>
          {(["chat", "events", "groups"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut,
                );
                setActiveTab(tab);
              }}
              style={[
                styles.tabItem,
                activeTab === tab && styles.tabItemActive,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
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
        <View style={styles.flexOne}>
          <View style={styles.chatNav}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chatRail}
            >
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
                    <Text
                      style={[
                        styles.chatChipText,
                        isActive && styles.chatChipTextActive,
                      ]}
                    >
                      {channel.display_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {threads.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chatRail}
              >
                <Pressable
                  onPress={() => {
                    setActiveThreadId(null);
                    setReplyToMessageId(null);
                  }}
                  style={[
                    styles.threadChip,
                    !activeThreadId && styles.threadChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.threadChipText,
                      !activeThreadId && styles.threadChipTextActive,
                    ]}
                  >
                    Main
                  </Text>
                </Pressable>
                {threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const count = threadMessageCount[thread.id] ?? 0;
                  return (
                    <Pressable
                      key={thread.id}
                      onPress={() => {
                        setActiveThreadId(thread.id);
                        setReplyToMessageId(null);
                      }}
                      style={[
                        styles.threadChip,
                        isActive && styles.threadChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.threadChipText,
                          isActive && styles.threadChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
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
                <Ionicons
                  name="chatbubbles-outline"
                  size={48}
                  color={COLORS.secondary + "40"}
                />
                <Text style={styles.emptyText}>
                  No messages yet. Sprout the conversation!
                </Text>
              </View>
            ) : (
              <ScrollView
                ref={chatFeedScrollRef}
                style={styles.chatFeedScroll}
                contentContainerStyle={styles.chatFeedContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  if (activeTab !== "chat") return;
                  const animated = !shouldAutoScrollChatRef.current;
                  scrollChatToBottom(animated);
                  shouldAutoScrollChatRef.current = false;
                }}
              >
                {visibleMessages.map((message) => {
                  const isMine = message.sender_id === userId;
                  const sender = profilesById[message.sender_id];
                  const senderName =
                    sender?.display_name?.trim() || (isMine ? "You" : "Member");
                  const attachments = attachmentsByMessage[message.id] ?? [];
                  const reactions = reactionsByMessage[message.id] ?? [];
                  const reactionSummary = reactions.reduce(
                    (acc, r) => {
                      if (!acc[r.emoji])
                        acc[r.emoji] = { count: 0, mine: false };
                      acc[r.emoji].count += 1;
                      if (r.user_id === userId) acc[r.emoji].mine = true;
                      return acc;
                    },
                    {} as Record<string, { count: number; mine: boolean }>,
                  );

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messageRow,
                        isMine && styles.messageRowMine,
                      ]}
                    >
                      {!isMine && (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarText}>
                            {(senderName || "M").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.messageContent}>
                        <Text
                          style={[
                            styles.messageSenderName,
                            isMine && styles.messageSenderNameMine,
                          ]}
                        >
                          {senderName}
                        </Text>
                        <Pressable
                          onPress={() => {
                            openMessageActions(message);
                          }}
                          style={[
                            styles.messageBubble,
                            isMine
                              ? styles.messageBubbleMine
                              : styles.messageBubbleOther,
                          ]}
                        >
                          {message.reply_to_message_id && (
                            <View style={styles.replyPreviewInline}>
                              <Text
                                style={styles.replyPreviewTextInline}
                                numberOfLines={1}
                              >
                                {messagePreview(
                                  messageById[message.reply_to_message_id],
                                )}
                              </Text>
                            </View>
                          )}
                          {message.kind !== "image" && !!message.body && (
                            <Text
                              style={[
                                styles.messageText,
                                isMine && styles.messageTextMine,
                              ]}
                            >
                              {message.body}
                            </Text>
                          )}
                          {getGifUrl(message) && (
                            <Image
                              source={{ uri: getGifUrl(message)! }}
                              style={styles.messageMedia}
                            />
                          )}
                          {attachments.map(
                            (a) =>
                              signedAttachmentUrls[a.storage_path] && (
                                <Image
                                  key={a.id}
                                  source={{
                                    uri: signedAttachmentUrls[a.storage_path],
                                  }}
                                  style={styles.messageMedia}
                                />
                              ),
                          )}
                        </Pressable>

                        <View
                          style={[
                            styles.messageMeta,
                            isMine && styles.messageMetaMine,
                          ]}
                        >
                          <Text style={styles.messageTime}>
                            {formatTime(message.created_at)}
                          </Text>
                          <Pressable
                            onPress={() => {
                              setReplyToMessageId(message.id);
                              setIsThreadMode(false);
                            }}
                          >
                            <Text style={styles.messageActionText}>Reply</Text>
                          </Pressable>
                        </View>

                        {Object.keys(reactionSummary).length > 0 && (
                          <View
                            style={[
                              styles.reactionList,
                              isMine && styles.reactionListMine,
                            ]}
                          >
                            {Object.entries(reactionSummary).map(
                              ([emoji, data]) => (
                                <Pressable
                                  key={emoji}
                                  onPress={() =>
                                    void toggleReaction(message.id, emoji)
                                  }
                                  style={[
                                    styles.reactionChip,
                                    data.mine && styles.reactionChipMine,
                                  ]}
                                >
                                  <Text
                                    style={styles.reactionChipText}
                                  >{`${emoji} ${data.count}`}</Text>
                                </Pressable>
                              ),
                            )}
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
          <View
            style={[
              styles.composerContainer,
              { paddingBottom: composerBottomPadding },
              { marginBottom: composerKeyboardLift },
            ]}
          >
            {replyToMessage && (
              <View style={styles.replyBar}>
                <Ionicons
                  name="return-down-forward"
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.replyBarText} numberOfLines={1}>
                  Replying to: {messagePreview(replyToMessage)}
                </Text>
                <Pressable onPress={() => setReplyToMessageId(null)}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={COLORS.secondary}
                  />
                </Pressable>
              </View>
            )}

            {isChatComposeDisabled && (
              <View style={styles.composeDisabledBanner}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={COLORS.secondary}
                />
                <Text style={styles.composeDisabledBannerText}>
                  Typing is disabled on web on phone.
                </Text>
              </View>
            )}

            <View style={styles.composerControls}>
              <Pressable
                onPress={() => setIsThreadMode(!isThreadMode)}
                disabled={isChatComposeDisabled}
                style={[
                  styles.controlButton,
                  isChatComposeDisabled && styles.controlButtonDisabled,
                  isThreadMode && styles.controlButtonActive,
                ]}
              >
                <Ionicons
                  name="list"
                  size={18}
                  color={isThreadMode ? COLORS.background : COLORS.primary}
                />
              </Pressable>
              <Pressable
                onPress={() => void uploadImageMessage()}
                disabled={isChatComposeDisabled}
                style={[
                  styles.controlButton,
                  isChatComposeDisabled && styles.controlButtonDisabled,
                ]}
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
                placeholder={
                  isChatComposeDisabled
                    ? "Typing is disabled on web on phone."
                    : Platform.OS === "web"
                      ? "Say something... (paste or drop an image)"
                      : "Say something..."
                }
                placeholderTextColor={COLORS.text + "60"}
                value={composerText}
                onChangeText={setComposerText}
                editable={!isChatComposeDisabled}
                onFocus={() => {
                  if (isChatComposeDisabled) return;
                  setIsKeyboardVisible(true);
                }}
                onBlur={() => {
                  setKeyboardHeight(0);
                  setIsKeyboardVisible(false);
                }}
                {...(Platform.OS === "web"
                  ? !isChatComposeDisabled
                    ? ({
                        onPaste: handleWebComposerPaste,
                        onDrop: handleWebComposerDrop,
                        onDragOver: handleWebComposerDragOver,
                      } as any)
                    : ({} as any)
                  : {
                      onImageChange: (event: KeyboardImageChangeEvent) =>
                        void uploadKeyboardMediaMessage(event),
                    })}
                style={styles.composerInput}
                multiline
              />
              <Pressable
                onPress={() => void sendComposer()}
                disabled={
                  isChatComposeDisabled ||
                  isSendingMessage ||
                  isUploadingImage ||
                  !activeChannelId
                }
                style={[
                  styles.sendButton,
                  isChatComposeDisabled && styles.sendButtonDisabled,
                ]}
              >
                {isSendingMessage || isUploadingImage ? (
                  <ActivityIndicator color={COLORS.background} size="small" />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={20}
                    color={COLORS.background}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Reaction Picker Modal */}
      <Modal
        visible={isReactionPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReactionPickerOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsReactionPickerOpen(false)}
        >
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.reactionPickerContainer}>
            <Text style={styles.reactionPickerTitle}>React</Text>
            <View style={styles.quickReactionGrid}>
              {QUICK_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (selectedMessageId) {
                      void toggleReaction(selectedMessageId, emoji);
                    }
                    setIsReactionPickerOpen(false);
                  }}
                  style={styles.bigReactionButton}
                >
                  <Text style={styles.bigReactionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.pickerActions}>
              {selectedMessageId &&
                messageById[selectedMessageId]?.sender_id === userId && (
                  <Pressable
                    style={styles.pickerActionButton}
                    onPress={() => {
                      const msg = messageById[selectedMessageId!];
                      setIsReactionPickerOpen(false);
                      Alert.alert(
                        "Delete message?",
                        "This removes the message for everyone.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => void deleteMyMessage(msg),
                          },
                        ],
                      );
                    }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={COLORS.warning}
                    />
                    <Text style={styles.pickerActionTextDanger}>
                      Delete Message
                    </Text>
                  </Pressable>
                )}
              <Pressable
                style={styles.pickerActionButton}
                onPress={() => {
                  if (selectedMessageId) {
                    setReplyToMessageId(selectedMessageId);
                    setIsThreadMode(false);
                  }
                  setIsReactionPickerOpen(false);
                }}
              >
                <Ionicons
                  name="return-up-back-outline"
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.pickerActionText}>Reply to Message</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Event Editor Modal */}
      <Modal
        visible={isEventEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={closeEventEditor}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            if (isSavingEventEdits) return;
            closeEventEditor();
          }}
        >
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.eventEditorContainer} onPress={() => {}}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.eventEditorContent}
            >
              <Text style={styles.eventEditorTitle}>Edit Event</Text>

              <TextInput
                placeholder="Event Title"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventTitle}
                onChangeText={setEditEventTitle}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Type (Cleanup, Social, etc.)"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventActivityType}
                onChangeText={setEditEventActivityType}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Location Name"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventLocationName}
                onChangeText={setEditEventLocationName}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Address"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventLocationAddress}
                onChangeText={setEditEventLocationAddress}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Starts (YYYY-MM-DD HH:mm)"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventStartsAt}
                onChangeText={setEditEventStartsAt}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Ends (YYYY-MM-DD HH:mm)"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventEndsAt}
                onChangeText={setEditEventEndsAt}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Signup Deadline (YYYY-MM-DD HH:mm)"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventSignUpDeadline}
                onChangeText={setEditEventSignUpDeadline}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Max Attendees"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventMaxAttendees}
                onChangeText={setEditEventMaxAttendees}
                style={styles.formInput}
                keyboardType="number-pad"
              />
              <TextInput
                placeholder="Description"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventDescription}
                onChangeText={setEditEventDescription}
                style={[styles.formInput, styles.formInputMulti]}
                multiline
              />
              <TextInput
                placeholder="Location Notes"
                placeholderTextColor={COLORS.text + "60"}
                value={editEventLocationNotes}
                onChangeText={setEditEventLocationNotes}
                style={[styles.formInput, styles.formInputMulti]}
                multiline
              />

              <View style={styles.formActions}>
                <Pressable
                  onPress={closeEventEditor}
                  style={styles.secondaryButton}
                  disabled={isSavingEventEdits}
                >
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </Pressable>
                <Pressable
                  onPress={() => void saveEventEdits()}
                  style={styles.primaryButton}
                  disabled={isSavingEventEdits}
                >
                  {isSavingEventEdits ? (
                    <ActivityIndicator color={COLORS.background} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>

              {editingEvent && (
                <View style={styles.eventEditorActions}>
                  <Pressable
                    onPress={() => {
                      const current = editingEvent;
                      closeEventEditor();
                      void toggleEventCancelled(current);
                    }}
                    style={styles.secondaryButton}
                    disabled={!!workingEventId || isSavingEventEdits}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {editingEvent.is_cancelled
                        ? "Reopen Event"
                        : "Cancel Event"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {activeTab === "events" && (
        <ScrollView
          contentContainerStyle={styles.tabContentScroll}
          showsVerticalScrollIndicator={false}
        >
          {isCreateEventOpen && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Sprout an Event</Text>
              <TextInput
                placeholder="Event Title"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventTitle}
                onChangeText={setNewEventTitle}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Type (Cleanup, Social, etc.)"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventActivityType}
                onChangeText={setNewEventActivityType}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Location Name"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventLocationName}
                onChangeText={handleCreateEventLocationNameChange}
                onFocus={() => setIsLocationSuggestionListOpen(true)}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Address"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventLocationAddress}
                onChangeText={handleCreateEventLocationAddressChange}
                onFocus={() => setIsLocationSuggestionListOpen(true)}
                style={styles.formInput}
              />
              {isLocationSuggestionListOpen &&
                (isLoadingLocationSuggestions ||
                  locationSuggestions.length > 0) && (
                  <View style={styles.locationSuggestionsCard}>
                    {isLoadingLocationSuggestions ? (
                      <View style={styles.locationSuggestionsLoadingRow}>
                        <ActivityIndicator
                          size="small"
                          color={COLORS.primary}
                        />
                        <Text style={styles.locationSuggestionsLoadingText}>
                          Searching places...
                        </Text>
                      </View>
                    ) : (
                      locationSuggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion.id}
                          onPress={() => applyLocationSuggestion(suggestion)}
                          style={styles.locationSuggestionItem}
                        >
                          <Text style={styles.locationSuggestionName}>
                            {suggestion.name}
                          </Text>
                          <Text style={styles.locationSuggestionAddress}>
                            {suggestion.address}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              <TextInput
                placeholder="Starts (YYYY-MM-DD HH:mm)"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventStartsAt}
                onChangeText={setNewEventStartsAt}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Ends (YYYY-MM-DD HH:mm)"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventEndsAt}
                onChangeText={setNewEventEndsAt}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Description"
                placeholderTextColor={COLORS.text + "60"}
                value={newEventDescription}
                onChangeText={setNewEventDescription}
                style={[styles.formInput, styles.formInputMulti]}
                multiline
              />
              <View style={styles.formActions}>
                <Pressable
                  onPress={resetCreateEventDrafts}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={() => void createEvent()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Create Event</Text>
                </Pressable>
              </View>
            </View>
          )}

          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="calendar-outline"
                size={48}
                color={COLORS.secondary + "40"}
              />
              <Text style={styles.emptyText}>
                No upcoming events in {cityName || "your region"}.
              </Text>
            </View>
          ) : (
            <>
              {myUpcomingEvents.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Your Events</Text>
                  {myUpcomingEvents.map(renderEventCard)}
                </>
              )}
              {otherUpcomingEvents.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Upcoming Events</Text>
                  {otherUpcomingEvents.map(renderEventCard)}
                </>
              )}
            </>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {activeTab === "groups" && (
        <ScrollView
          contentContainerStyle={styles.tabContentScroll}
          showsVerticalScrollIndicator={false}
        >
          {isCreateOpen && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>New Group</Text>
              <TextInput
                placeholder="Group Name"
                placeholderTextColor={COLORS.text + "60"}
                value={newTeamName}
                onChangeText={setNewTeamName}
                style={styles.formInput}
              />
              <TextInput
                placeholder="Description"
                placeholderTextColor={COLORS.text + "60"}
                value={newTeamDescription}
                onChangeText={setNewTeamDescription}
                style={[styles.formInput, styles.formInputMulti]}
                multiline
              />
              <Pressable
                onPress={() => void createTeam()}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Create Group</Text>
              </Pressable>
            </View>
          )}

          {teams.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No groups found. Be the first to start one!
              </Text>
            </View>
          ) : (
            <>
              {joinedTeams.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Your Groups</Text>
                  {joinedTeams.map(renderTeamCard)}
                </>
              )}
              <Text style={styles.sectionLabel}>
                {joinedTeams.length > 0 ? "Discover Groups" : "Regional Groups"}
              </Text>
              {availableTeams.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    No other groups yet. Start one!
                  </Text>
                </View>
              ) : (
                availableTeams.map(renderTeamCard)
              )}
            </>
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
  messageSenderNameMine: {
    textAlign: "right",
    marginRight: 4,
    marginLeft: 0,
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
  composeDisabledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.warning + "18",
    borderWidth: 1,
    borderColor: COLORS.warning + "4D",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  composeDisabledBannerText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.accent + "30",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonDisabled: {
    opacity: 0.45,
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
  sendButtonDisabled: {
    opacity: 0.45,
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
  locationSuggestionsCard: {
    marginTop: -6,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "20",
    backgroundColor: COLORS.background + "F0",
    overflow: "hidden",
  },
  locationSuggestionsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationSuggestionsLoadingText: {
    color: COLORS.secondary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 14,
  },
  locationSuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.secondary + "12",
  },
  locationSuggestionName: {
    color: COLORS.primary,
    fontFamily: "Boogaloo_400Regular",
    fontSize: 15,
  },
  locationSuggestionAddress: {
    color: COLORS.text + "AA",
    fontFamily: "Boogaloo_400Regular",
    fontSize: 12,
    marginTop: 2,
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
  eventCardHost: {
    color: COLORS.text + "99",
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 2,
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
  eventLocationLink: {
    alignItems: "flex-start",
  },
  eventLocationTextWrap: {
    flex: 1,
  },
  eventLocationAddressText: {
    color: COLORS.text + "AA",
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 2,
  },
  eventLocationHintText: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 3,
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
  teamMeta: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: "Boogaloo_400Regular",
    marginTop: 2,
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
  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  eventEditorContainer: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: COLORS.background,
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  eventEditorContent: {
    paddingBottom: 8,
  },
  eventEditorTitle: {
    color: COLORS.primary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  eventEditorActions: {
    marginTop: 16,
  },
  reactionPickerContainer: {
    width: "100%",
    backgroundColor: COLORS.background,
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  reactionPickerTitle: {
    color: COLORS.primary,
    fontSize: 24,
    fontFamily: "Boogaloo_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  quickReactionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  bigReactionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent + "30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  bigReactionText: {
    fontSize: 24,
  },
  pickerActions: {
    gap: 12,
  },
  pickerActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.accent + "15",
    borderRadius: 16,
    gap: 12,
  },
  pickerActionText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  pickerActionTextDanger: {
    color: COLORS.warning,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
});
