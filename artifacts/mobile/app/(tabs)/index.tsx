import { useGetDevices } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { io } from "socket.io-client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function DeviceListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, logout } = useAuth();

  const { data: devices, isLoading, isError, refetch } = useGetDevices();

  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = io(`https://${process.env.EXPO_PUBLIC_DOMAIN}`, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("device:status", ({ deviceId, status }: { deviceId: string; status: string }) => {
      setStatusOverrides((prev) => ({ ...prev, [deviceId]: status }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDevicePress = useCallback(async (device: Device) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/(tabs)/device/[id]", params: { id: device.id, name: device.name } });
  }, [router]);

  const getStatus = (device: Device) =>
    (statusOverrides[device.id] ?? device.status) as "online" | "offline" | "unknown";

  const statusColor = (status: string) => {
    if (status === "online") return colors.online;
    if (status === "offline") return colors.offline;
    return colors.unknown;
  };

  const statusLabel = (status: string) => {
    if (status === "online") return "EN LÍNEA";
    if (status === "offline") return "DESCONECTADO";
    return "DESCONOCIDO";
  };

  const topPad = Platform.OS === "web" ? 67 : 0;

  const renderDevice = ({ item }: { item: Device }) => {
    const status = getStatus(item);
    const sColor = statusColor(status);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={() => handleDevicePress(item)}
        testID={`device-item-${item.id}`}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.statusDot, { backgroundColor: sColor }]} />
          <View style={styles.cardInfo}>
            <Text style={[styles.deviceName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {item.name}
            </Text>
            <Text style={[styles.deviceIp, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {item.ip}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.statusLabel, { color: sColor, fontFamily: "Inter_500Medium" }]}>
            {statusLabel(status)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
      </Pressable>
    );
  };

  const headerTopPad = Platform.OS === "web" ? topPad : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: headerTopPad + 12,
          },
        ]}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Mis TVs
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {devices ? `${devices.length} dispositivos` : "Cargando..."}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={logout}
            testID="button-logout"
          >
            <Ionicons name="log-out-outline" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Ionicons name="wifi-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Error de conexión
          </Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={devices ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderDevice}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          scrollEnabled={!!(devices && devices.length > 0)}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="tv-outline" size={56} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Sin dispositivos registrados
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Registra equipos desde el panel web
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  logoutBtn: {
    padding: 8,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
  },
  deviceIp: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  emptyState: {
    paddingTop: 80,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 15,
  },
});
