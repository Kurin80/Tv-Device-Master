import {
  useGetDevice,
  useGetDeviceApps,
  useSendCommand,
} from "@workspace/api-client-react";
import type { CommandRequestAction } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function RemoteBtn({
  icon,
  label,
  onPress,
  size = 52,
  iconSize = 24,
  color,
  disabled = false,
  testID,
}: {
  icon: IconName;
  label?: string;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const btnColor = color ?? colors.foreground;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.remoteBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Ionicons name={icon} size={iconSize} color={btnColor} />
      {label ? (
        <Text style={[styles.remoteBtnLabel, { color: btnColor, fontFamily: "Inter_500Medium" }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function AppPill({
  name,
  onPress,
  disabled,
}: {
  name: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.appPill,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name="apps-outline" size={16} color={colors.primary} />
      <Text
        style={[styles.appPillText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
        numberOfLines={1}
      >
        {name.split(".").pop() ?? name}
      </Text>
    </Pressable>
  );
}

export default function DeviceRemoteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  const navigation = useNavigation();
  const id = params.id ?? "";

  const { data: device } = useGetDevice(id);
  const { data: apps } = useGetDeviceApps(id);
  const sendCmd = useSendCommand();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastSuccessAction, setLastSuccessAction] = useState<string | null>(null);
  const [openAppVisible, setOpenAppVisible] = useState(false);
  const [openAppPackage, setOpenAppPackage] = useState("");

  const isOnline = device?.status === "online";

  useEffect(() => {
    if (params.name) {
      navigation.setOptions({ title: params.name });
    }
  }, [params.name, navigation]);

  const send = useCallback(
    async (action: CommandRequestAction, param?: string, keycode?: number) => {
      if (!isOnline || sendCmd.isPending) return;
      setPendingAction(action + (keycode ?? ""));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await sendCmd.mutateAsync({ id, data: { action, param, keycode } });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLastSuccessAction(action);
        setTimeout(() => setLastSuccessAction(null), 1500);
      } catch {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", "No se pudo ejecutar el comando");
      } finally {
        setPendingAction(null);
      }
    },
    [isOnline, sendCmd]
  );

  const handleOpenApp = () => {
    if (!openAppPackage.trim()) return;
    send("open_app", openAppPackage.trim());
    setOpenAppVisible(false);
    setOpenAppPackage("");
  };

  const statusColor =
    device?.status === "online"
      ? colors.online
      : device?.status === "offline"
      ? colors.offline
      : colors.unknown;

  const statusLabel =
    device?.status === "online"
      ? "EN LÍNEA"
      : device?.status === "offline"
      ? "DESCONECTADO"
      : "DESCONOCIDO";

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Status bar */}
      <View style={[styles.statusBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor, fontFamily: "Inter_500Medium" }]}>
            {statusLabel}
          </Text>
        </View>
        {lastSuccessAction ? (
          <Text style={[styles.successText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Enviado ✓
          </Text>
        ) : device?.ip ? (
          <Text style={[styles.ipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {device.ip}
          </Text>
        ) : null}
      </View>

      {/* Power row */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          ENERGÍA
        </Text>
        <View style={styles.powerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.powerBtn,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
                flex: 1,
              },
            ]}
            onPress={() => send("screen_on")}
            disabled={!isOnline || sendCmd.isPending}
            testID="btn-screen-on"
          >
            <Ionicons name="sunny-outline" size={20} color={colors.online} />
            <Text style={[styles.powerBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Pantalla ON
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.powerBtn,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
                flex: 1,
              },
            ]}
            onPress={() => send("screen_off")}
            disabled={!isOnline || sendCmd.isPending}
            testID="btn-screen-off"
          >
            <Ionicons name="moon-outline" size={20} color={colors.mutedForeground} />
            <Text style={[styles.powerBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Pantalla OFF
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.powerBtn,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
                flex: 1,
              },
            ]}
            onPress={() => send("reboot")}
            disabled={!isOnline || sendCmd.isPending}
            testID="btn-reboot"
          >
            <Ionicons name="refresh-outline" size={20} color={colors.destructive} />
            <Text style={[styles.powerBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Reiniciar
            </Text>
          </Pressable>
        </View>
      </View>

      {/* D-Pad + Navigation */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          CONTROL
        </Text>
        <View style={styles.controlsRow}>
          {/* Volume column */}
          <View style={styles.sideColumn}>
            <RemoteBtn
              icon="volume-high-outline"
              onPress={() => send("keyevent", undefined, 24)}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-vol-up"
            />
            <Text style={[styles.sideLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              VOL
            </Text>
            <RemoteBtn
              icon="volume-low-outline"
              onPress={() => send("keyevent", undefined, 25)}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-vol-down"
            />
          </View>

          {/* D-Pad */}
          <View style={styles.dpad}>
            <RemoteBtn
              icon="chevron-up"
              onPress={() => send("keyevent", undefined, 19)}
              size={60}
              iconSize={28}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-up"
            />
            <View style={styles.dpadMiddle}>
              <RemoteBtn
                icon="chevron-back"
                onPress={() => send("keyevent", undefined, 21)}
                size={60}
                iconSize={28}
                disabled={!isOnline || sendCmd.isPending}
                testID="btn-left"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.okBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => send("keyevent", undefined, 23)}
                disabled={!isOnline || sendCmd.isPending}
                testID="btn-ok"
              >
                <Text style={[styles.okText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                  OK
                </Text>
              </Pressable>
              <RemoteBtn
                icon="chevron-forward"
                onPress={() => send("keyevent", undefined, 22)}
                size={60}
                iconSize={28}
                disabled={!isOnline || sendCmd.isPending}
                testID="btn-right"
              />
            </View>
            <RemoteBtn
              icon="chevron-down"
              onPress={() => send("keyevent", undefined, 20)}
              size={60}
              iconSize={28}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-down"
            />
          </View>

          {/* Action column */}
          <View style={styles.sideColumn}>
            <RemoteBtn
              icon="home-outline"
              onPress={() => send("home")}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-home"
            />
            <Text style={[styles.sideLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              NAV
            </Text>
            <RemoteBtn
              icon="arrow-back-outline"
              onPress={() => send("back")}
              disabled={!isOnline || sendCmd.isPending}
              testID="btn-back"
            />
          </View>
        </View>

        {/* Secondary actions: Menu + Open App */}
        <View style={styles.secondaryRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => send("keyevent", undefined, 82)}
            disabled={!isOnline || sendCmd.isPending}
            testID="btn-menu"
          >
            <Ionicons name="menu-outline" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Menú
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                opacity: !isOnline ? 0.35 : pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => setOpenAppVisible(true)}
            disabled={!isOnline}
            testID="btn-open-app"
          >
            <Ionicons name="apps-outline" size={18} color={colors.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Abrir App
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Installed Apps */}
      {apps && apps.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            APPS INSTALADAS
          </Text>
          <View style={styles.appsGrid}>
            {apps.map((app) => (
              <AppPill
                key={app.id}
                name={app.appName ?? app.packageName}
                onPress={() => send("open_app", app.packageName)}
                disabled={!isOnline || sendCmd.isPending}
              />
            ))}
          </View>
        </View>
      )}

      {sendCmd.isPending && (
        <View style={styles.pendingOverlay}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* Open App Modal */}
      <Modal
        visible={openAppVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenAppVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpenAppVisible(false)}
        >
          <Pressable
            style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Abrir Aplicación
            </Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nombre del paquete Android
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              placeholder="com.example.app"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              value={openAppPackage}
              onChangeText={setOpenAppPackage}
              onSubmitEditing={handleOpenApp}
              autoFocus
              testID="input-open-app-package"
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => { setOpenAppVisible(false); setOpenAppPackage(""); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: openAppPackage.trim() ? colors.primary : colors.muted,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={handleOpenApp}
                disabled={!openAppPackage.trim()}
              >
                <Text style={[styles.modalBtnText, { color: colors.primaryForeground, fontFamily: "Inter_500Medium" }]}>
                  Abrir
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    gap: 12,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    letterSpacing: 0.8,
  },
  successText: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  ipText: {
    fontSize: 12,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  powerRow: {
    flexDirection: "row",
    gap: 8,
  },
  powerBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  powerBtnText: {
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideColumn: {
    alignItems: "center",
    gap: 8,
    width: 52,
  },
  sideLabel: {
    fontSize: 10,
    letterSpacing: 1,
  },
  dpad: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  dpadMiddle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  okBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  okText: {
    fontSize: 20,
  },
  remoteBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    gap: 2,
  },
  remoteBtnLabel: {
    fontSize: 10,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
  },
  appsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  appPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  appPillText: {
    fontSize: 13,
    maxWidth: 120,
  },
  pendingOverlay: {
    position: "absolute",
    top: 0,
    right: 24,
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    textAlign: "center",
  },
  modalHint: {
    fontSize: 13,
    textAlign: "center",
  },
  modalInput: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  modalBtnText: {
    fontSize: 15,
  },
});
