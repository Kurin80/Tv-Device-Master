import { Stack } from "expo-router";
import colors from "@/constants/colors";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.dark.card },
        headerTintColor: colors.dark.foreground,
        headerTitleStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 17,
          color: colors.dark.foreground,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.dark.background },
      }}
    />
  );
}
