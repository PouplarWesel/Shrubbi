import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import { useSupabase } from "@/hooks/useSupabase";

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  city_id: string;
};

const getFriendlyErrorMessage = (message: string) => {
  if (message.includes("teams_city_name_key")) {
    return "A group with this name already exists in your region.";
  }
  if (message.includes("row-level security")) {
    return "Your account cannot create groups yet. Please contact support.";
  }
  return message;
};

export default function SocialPage() {
  const { session, supabase } = useSupabase();
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkingTeamId, setIsWorkingTeamId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [cityName, setCityName] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [joinedTeamIds, setJoinedTeamIds] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");

  const userId = session?.user?.id ?? null;

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

    const [{ data: membershipsData }, { data: teamsData }] = await Promise.all([
      supabase.from("team_memberships").select("team_id").eq("user_id", userId),
      currentCityId
        ? supabase
            .from("teams")
            .select("id, name, description, city_id")
            .eq("city_id", currentCityId)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] as TeamRow[] }),
    ]);

    setJoinedTeamIds((membershipsData ?? []).map((row) => row.team_id));
    setTeams((teamsData ?? []) as TeamRow[]);
    setIsLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void loadSocialData();
  }, [loadSocialData]);

  const joinedTeams = useMemo(
    () => teams.filter((team) => joinedTeamIds.includes(team.id)),
    [joinedTeamIds, teams],
  );
  const availableTeams = useMemo(
    () => teams.filter((team) => !joinedTeamIds.includes(team.id)),
    [joinedTeamIds, teams],
  );

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
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Social</Text>
      <Text style={styles.subtitle}>
        {cityName
          ? `Region: ${cityName}`
          : "Set your city in onboarding first."}
      </Text>

      {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Groups In Your Region</Text>
          <Pressable
            disabled={!cityId}
            onPress={() => setIsCreateOpen((prev) => !prev)}
            style={[
              styles.headerButton,
              !cityId && styles.headerButtonDisabled,
            ]}
          >
            <Ionicons name="add" size={16} color={COLORS.background} />
            <Text style={styles.headerButtonText}>Create Group</Text>
          </Pressable>
        </View>

        {isCreateOpen && (
          <View style={styles.createCard}>
            <TextInput
              placeholder="Team name"
              placeholderTextColor={COLORS.secondary + "90"}
              value={newTeamName}
              onChangeText={setNewTeamName}
              style={styles.input}
            />
            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor={COLORS.secondary + "90"}
              value={newTeamDescription}
              onChangeText={setNewTeamDescription}
              style={[styles.input, styles.inputMultiline]}
              multiline
              numberOfLines={3}
            />
            <Pressable
              disabled={isCreatingTeam}
              onPress={createTeam}
              style={styles.createButton}
            >
              {isCreatingTeam ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.teamButtonText}>Create + Join</Text>
              )}
            </Pressable>
          </View>
        )}

        {!cityId ? (
          <Text style={styles.sectionBody}>
            You need a city set on your profile to join groups.
          </Text>
        ) : teams.length === 0 ? (
          <Text style={styles.sectionBody}>
            No groups found for your region yet.
          </Text>
        ) : (
          teams.map((team) => {
            const isJoined = joinedTeamIds.includes(team.id);
            const isWorking = isWorkingTeamId === team.id;
            return (
              <View key={team.id} style={styles.teamCard}>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  {!!team.description && (
                    <Text style={styles.teamDescription}>
                      {team.description}
                    </Text>
                  )}
                </View>
                <Pressable
                  disabled={isWorking}
                  onPress={() =>
                    isJoined ? leaveTeam(team.id) : joinTeam(team.id)
                  }
                  style={[styles.teamButton, isJoined && styles.leaveButton]}
                >
                  {isWorking ? (
                    <ActivityIndicator color={COLORS.background} />
                  ) : (
                    <Text style={styles.teamButtonText}>
                      {isJoined ? "Leave" : "Join"}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Joined Groups</Text>
        {joinedTeams.length === 0 ? (
          <Text style={styles.sectionBody}>
            You haven&apos;t joined any groups yet.
          </Text>
        ) : (
          joinedTeams.map((team) => (
            <View key={team.id} style={styles.joinedRow}>
              <Ionicons name="people" size={16} color={COLORS.primary} />
              <Text style={styles.joinedText}>{team.name}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available To Join</Text>
        {availableTeams.length === 0 ? (
          <Text style={styles.sectionBody}>No additional teams to join.</Text>
        ) : (
          availableTeams.map((team) => (
            <View key={team.id} style={styles.joinedRow}>
              <Ionicons name="leaf-outline" size={16} color={COLORS.primary} />
              <Text style={styles.joinedText}>{team.name}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Chat</Text>
        <Text style={styles.sectionBody}>
          Group and region chat need message tables, which are not in the
          current schema yet.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 20,
    gap: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontFamily: "Boogaloo_400Regular",
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Boogaloo_400Regular",
  },
  errorText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  section: {
    borderWidth: 1,
    borderColor: COLORS.secondary + "40",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    backgroundColor: COLORS.accent + "50",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontFamily: "Boogaloo_400Regular",
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    minHeight: 30,
  },
  headerButtonDisabled: {
    opacity: 0.4,
  },
  headerButtonText: {
    color: COLORS.background,
    fontSize: 13,
    fontFamily: "Boogaloo_400Regular",
  },
  createCard: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    backgroundColor: COLORS.background,
    padding: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 10,
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
    paddingHorizontal: 10,
    minHeight: 38,
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  createButton: {
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  sectionBody: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
  teamCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.background,
  },
  teamInfo: {
    flex: 1,
    gap: 2,
  },
  teamName: {
    color: COLORS.primary,
    fontSize: 18,
    fontFamily: "Boogaloo_400Regular",
  },
  teamDescription: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  teamButton: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  leaveButton: {
    backgroundColor: COLORS.secondary,
  },
  teamButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontFamily: "Boogaloo_400Regular",
  },
  joinedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  joinedText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Boogaloo_400Regular",
  },
});
