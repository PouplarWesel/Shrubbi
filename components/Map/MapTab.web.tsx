import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";

export default function MapTabWeb() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Map is not available on web yet</Text>
        <Text style={styles.body}>
          This screen uses native Mapbox components. Open Shrubbi on iOS/Android
          to view the interactive city map.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    padding: 18,
    backgroundColor: COLORS.accent + "18",
    borderWidth: 1,
    borderColor: COLORS.primary + "24",
  },
  title: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  body: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.9,
  },
});

