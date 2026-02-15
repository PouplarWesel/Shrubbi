import { useSupabase } from "./useSupabase";

export const useSignUp = () => {
  const { isLoaded, supabase } = useSupabase();

  const signUp = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    if (error) throw error;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (signInError) {
      if (
        signInError.message.toLowerCase().includes("email not confirmed") ||
        signInError.message.toLowerCase().includes("email_not_confirmed")
      ) {
        throw new Error(
          "Email confirmation is enabled in Supabase. Disable Confirm email in Auth settings to skip email codes.",
        );
      }
      throw signInError;
    }
  };

  return {
    isLoaded,
    signUp,
  };
};
