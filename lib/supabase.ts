import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createClient,
  processLock,
  SupabaseClient,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY",
  );
}

const globalWithSupabase = globalThis as typeof globalThis & {
  __supabaseClient?: SupabaseClient;
};

const isServerRuntime = typeof window === "undefined";
const isReactNativeRuntime =
  typeof navigator !== "undefined" && navigator.product === "ReactNative";

const nonTimingOutLock = async <R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
) => {
  return processLock(name, -1, fn);
};

if (!globalWithSupabase.__supabaseClient) {
  globalWithSupabase.__supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: isReactNativeRuntime ? AsyncStorage : undefined,
      autoRefreshToken: !isServerRuntime,
      persistSession: !isServerRuntime,
      detectSessionInUrl: false,
      lock: isReactNativeRuntime ? nonTimingOutLock : undefined,
    },
  });
}

export const supabase = globalWithSupabase.__supabaseClient;
