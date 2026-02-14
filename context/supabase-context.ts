import { createContext } from "react";

import { Session, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseContextValue {
  isLoaded: boolean;
  session: Session | null;
  supabase: SupabaseClient;
  signOut: () => Promise<void>;
}

export const SupabaseContext = createContext<SupabaseContextValue | null>(null);
