import { useSupabase } from "./useSupabase";

export const useSignIn = () => {
  const { isLoaded, supabase } = useSupabase();

  const signInWithPassword = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    if (error) throw error;
  };

  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  };

  return {
    isLoaded,
    signInWithPassword,
    resetPasswordForEmail,
  };
};
