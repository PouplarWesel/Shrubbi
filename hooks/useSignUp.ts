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
  };

  const verifyOtp = async ({
    email,
    token,
  }: {
    email: string;
    token: string;
  }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();

    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email",
    });
    if (error) throw error;
  };

  return {
    isLoaded,
    signUp,
    verifyOtp,
  };
};
