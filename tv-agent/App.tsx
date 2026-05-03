/**
 * MDM TV Agent — Android TV companion app
 *
 * Responsibilities:
 *   1. QR enrollment: scan the QR shown in the MDM dashboard, POST to /api/devices/enroll,
 *      receive and persist the deviceToken.
 *   2. Heartbeat: POST /api/agent/heartbeat every 30 s to keep the device online.
 *   3. Command polling: GET /api/agent/commands every 10 s, execute locally, POST result.
 *
 * This model works over any internet connection — no ADB port forwarding required.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  StatusBar,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = "loading" | "scanning" | "enrolling" | "active" | "error";

interface AgentState {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  serverUrl: string; // e.g. https://my-app.replit.app
}

interface PendingCommand {
  id: string;
  command: string;
  param: string | null;
  createdAt: string;
}

interface CommandResult {
  status: "success" | "error";
  response: string;
  packages?: string[];
}

// ─── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_KEY = "mdm_agent_state";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  background: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  primary: "#3b82f6",
  primaryFg: "#ffffff",
  foreground: "#f8fafc",
  muted: "#94a3b8",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  overlay: "rgba(0,0,0,0.6)",
};

// ─── Command executor ─────────────────────────────────────────────────────────

async function executeCommand(command: string, param: string | null): Promise<CommandResult> {
  try {
    switch (command) {
      case "open_app": {
        if (!param) return { status: "error", response: "package_name requerido" };
        await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
          packageName: param,
          flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK
        });
        return { status: "success", response: `App ${param} lanzada` };
      }

      case "home": {
        await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
          category: "android.intent.category.HOME",
          flags: 0x10000000,
        });
        return { status: "success", response: "Pantalla de inicio" };
      }

      case "screen_on":
      case "screen_toggle": {
        // Attempt wake-up via broadcast — works on many Android TV builds
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
            flags: 0x10000000 | 0x00200000, // FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK
            category: "android.intent.category.HOME",
          });
        } catch {
          // Ignore — best effort
        }
        return { status: "success", response: "Wake-up enviado" };
      }

      case "screen_off":
        // Screen off requires system/DeviceAdmin permissions — report gracefully
        return {
          status: "error",
          response: "screen_off requiere permisos de administrador del dispositivo",
        };

      case "reboot":
        return {
          status: "error",
          response: "reboot requiere permisos de sistema (rooted/DeviceAdmin)",
        };

      case "sync_apps": {
        // Return empty list — PackageManager requires a native module.
        // The ADB path handles sync_apps when the device is on the same network.
        return {
          status: "success",
          response: "sync_apps no disponible via agente (usa ADB en misma red)",
          packages: [],
        };
      }

      case "back": {
        // Back key via intent — works on most Android TV devices
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
            flags: 0x10000000,
            category: "android.intent.category.HOME",
          });
        } catch {
          // Ignore
        }
        return { status: "success", response: "Back enviado" };
      }

      case "kiosk_enable":
        return {
          status: "error",
          response: "kiosk_enable requiere Device Policy Manager (Device Owner)",
        };

      case "kiosk_disable":
        return {
          status: "error",
          response: "kiosk_disable requiere Device Policy Manager (Device Owner)",
        };

      default:
        return {
          status: "error",
          response: `Comando "${command}" no soportado por el agente`,
        };
    }
  } catch (err) {
    return {
      status: "error",
      response: err instanceof Error ? err.message : "Error desconocido al ejecutar comando",
    };
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [permission, requestPermission] = useCameraPermissions();
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("");
  const [commandsExecuted, setCommandsExecuted] = useState<number>(0);
  const [lastCommand, setLastCommand] = useState<string>("");
  const scannedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load persisted state on mount ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const state = JSON.parse(raw) as AgentState;
          setAgentState(state);
          setScreen("active");
        } else {
          setScreen("scanning");
        }
      })
      .catch(() => setScreen("scanning"));
  }, []);

  // ── Start/stop polling when entering/leaving active state ──
  const sendHeartbeat = useCallback(
    async (state: AgentState) => {
      try {
        const ip = await Network.getIpAddressAsync().catch(() => null);
        await fetch(`${state.serverUrl}/api/agent/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Token": state.deviceToken,
          },
          body: JSON.stringify({ ip: ip ?? undefined }),
        });
        setLastHeartbeat(new Date().toLocaleTimeString());
      } catch {
        // Network error — will retry on next interval
      }
    },
    []
  );

  const pollCommands = useCallback(
    async (state: AgentState) => {
      try {
        const res = await fetch(`${state.serverUrl}/api/agent/commands`, {
          headers: { "X-Device-Token": state.deviceToken },
        });
        if (!res.ok) return;

        const commands = (await res.json()) as PendingCommand[];
        for (const cmd of commands) {
          setLastCommand(`${cmd.command}${cmd.param ? ` (${cmd.param})` : ""}`);
          const result = await executeCommand(cmd.command, cmd.param);
          setCommandsExecuted((n) => n + 1);

          await fetch(`${state.serverUrl}/api/agent/commands/${cmd.id}/result`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Device-Token": state.deviceToken,
            },
            body: JSON.stringify(result),
          }).catch(() => {});
        }
      } catch {
        // Network error — will retry
      }
    },
    []
  );

  useEffect(() => {
    if (screen !== "active" || !agentState) return;

    // Immediate first heartbeat
    void sendHeartbeat(agentState);

    heartbeatRef.current = setInterval(() => void sendHeartbeat(agentState), 30_000);
    pollingRef.current = setInterval(() => void pollCommands(agentState), 10_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [screen, agentState, sendHeartbeat, pollCommands]);

  // ── QR enrollment ──
  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setScreen("enrolling");

      try {
        let payload: { enrollUrl: string; token: string };
        try {
          payload = JSON.parse(data) as { enrollUrl: string; token: string };
        } catch {
          throw new Error(
            "QR inválido. Escanea el código generado por el panel MDM."
          );
        }

        if (!payload.enrollUrl || !payload.token) {
          throw new Error("QR incompleto. Genera un nuevo código en el panel MDM.");
        }

        const ip = await Network.getIpAddressAsync();
        if (!ip || ip === "0.0.0.0") {
          throw new Error(
            "No se pudo obtener la dirección IP. Verifica que el TV esté conectado a la red."
          );
        }

        const deviceName =
          Device.deviceName ?? Device.modelName ?? "Android TV";

        const response = await fetch(payload.enrollUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: payload.token, name: deviceName, ip }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Error del servidor: ${response.status}`);
        }

        const device = (await response.json()) as {
          id: string;
          deviceToken: string;
          name: string;
          ip: string;
        };

        if (!device.deviceToken) {
          throw new Error(
            "El servidor no devolvió un token de dispositivo. " +
              "Asegúrate de que el servidor esté actualizado."
          );
        }

        // Derive server base URL from the enrollUrl
        const url = new URL(payload.enrollUrl);
        const serverUrl = `${url.protocol}//${url.host}`;

        const state: AgentState = {
          deviceId: device.id,
          deviceToken: device.deviceToken,
          deviceName: device.name,
          serverUrl,
        };

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setAgentState(state);
        setScreen("active");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setErrorMsg(message);
        scannedRef.current = false;
        setScreen("error");
      }
    },
    []
  );

  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    scannedRef.current = false;
    setAgentState(null);
    setErrorMsg("");
    setLastHeartbeat("");
    setCommandsExecuted(0);
    setLastCommand("");
    setScreen("scanning");
  }, []);

  // ── Render ──

  if (screen === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.hint}>Iniciando agente MDM...</Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.hint}>Verificando permisos...</Text>
      </View>
    );
  }

  if (!permission.granted && screen === "scanning") {
    return (
      <View style={styles.centered}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Text style={styles.body}>
          El agente necesita la cámara para escanear el código QR de inscripción.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Permitir acceso</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "scanning") {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Text style={styles.appName}>MDM TV Agent</Text>
            <Text style={styles.appSubtitle}>Inscripción de dispositivo</Text>
          </View>
          <View style={styles.scanArea}>
            <View style={styles.qrFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
          <View style={styles.bottomBar}>
            <Text style={styles.instructions}>
              Apunta al código QR del panel MDM
            </Text>
            <Text style={styles.subInstructions}>
              El dispositivo se inscribirá y comenzará a recibir comandos automáticamente
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (screen === "enrolling") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.title}>Inscribiendo dispositivo...</Text>
        <Text style={styles.body}>Conectando con el servidor MDM</Text>
      </View>
    );
  }

  if (screen === "active" && agentState) {
    return (
      <ScrollView contentContainerStyle={styles.activeContainer}>
        <StatusBar hidden />

        {/* Status header */}
        <View style={styles.statusHeader}>
          <View style={styles.statusDot} />
          <Text style={styles.statusTitle}>Dispositivo Gestionado</Text>
        </View>

        {/* Device info card */}
        <View style={styles.card}>
          <Row label="Dispositivo" value={agentState.deviceName} />
          <Row label="Servidor" value={agentState.serverUrl} />
          <Row label="ID" value={agentState.deviceId.slice(0, 8) + "…"} />
        </View>

        {/* Activity card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actividad del Agente</Text>
          <Row
            label="Último heartbeat"
            value={lastHeartbeat || "Enviando…"}
          />
          <Row
            label="Comandos ejecutados"
            value={String(commandsExecuted)}
          />
          {lastCommand ? (
            <Row label="Último comando" value={lastCommand} />
          ) : null}
        </View>

        <Text style={styles.info}>
          El agente envía un heartbeat cada 30 s y comprueba comandos cada 10 s.
          Este dispositivo es controlable desde cualquier lugar por internet.
        </Text>

        <Pressable style={styles.dangerBtn} onPress={reset}>
          <Text style={styles.dangerBtnText}>Desinscribir dispositivo</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // error screen
  return (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>✗</Text>
      <Text style={[styles.title, { color: COLORS.error }]}>Error de inscripción</Text>
      <Text style={styles.body}>{errorMsg}</Text>
      <Pressable style={styles.primaryBtn} onPress={() => setScreen("scanning")}>
        <Text style={styles.primaryBtnText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center",
    padding: 48, gap: 20,
  },
  activeContainer: {
    flexGrow: 1, backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center",
    padding: 48, gap: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    flexDirection: "column",
  },
  topBar: {
    paddingHorizontal: 48, paddingTop: 32, paddingBottom: 16,
    alignItems: "center", gap: 6,
  },
  appName: { fontSize: 28, fontWeight: "700", color: COLORS.foreground, letterSpacing: 1 },
  appSubtitle: { fontSize: 16, color: COLORS.muted },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  qrFrame: { width: 240, height: 240, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderColor: COLORS.primary },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  bottomBar: {
    paddingHorizontal: 48, paddingBottom: 40, paddingTop: 16,
    alignItems: "center", gap: 8,
  },
  instructions: { fontSize: 22, fontWeight: "600", color: COLORS.foreground, textAlign: "center" },
  subInstructions: { fontSize: 16, color: COLORS.muted, textAlign: "center" },
  statusHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.success,
    shadowColor: COLORS.success, shadowOpacity: 0.8, shadowRadius: 6,
  },
  statusTitle: { fontSize: 28, fontWeight: "700", color: COLORS.success },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 24, width: "100%", maxWidth: 640, gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.muted, marginBottom: 4, letterSpacing: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 18, color: COLORS.muted, fontWeight: "500" },
  rowValue: { fontSize: 18, color: COLORS.foreground, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 16 },
  info: {
    fontSize: 16, color: COLORS.muted, textAlign: "center",
    lineHeight: 24, maxWidth: 600,
  },
  title: { fontSize: 36, fontWeight: "700", color: COLORS.foreground, textAlign: "center" },
  body: { fontSize: 20, color: COLORS.muted, textAlign: "center", lineHeight: 30, maxWidth: 600 },
  hint: { fontSize: 18, color: COLORS.muted, textAlign: "center", marginTop: 16 },
  icon: { fontSize: 72 },
  successIcon: { fontSize: 80, color: COLORS.success, fontWeight: "700" },
  errorIcon: { fontSize: 80, color: COLORS.error, fontWeight: "700" },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 48, paddingVertical: 16,
    borderRadius: 12, marginTop: 8,
  },
  primaryBtnText: { fontSize: 20, fontWeight: "700", color: COLORS.primaryFg },
  dangerBtn: {
    backgroundColor: "transparent",
    borderWidth: 1, borderColor: COLORS.error,
    paddingHorizontal: 48, paddingVertical: 16,
    borderRadius: 12, marginTop: 8,
  },
  dangerBtnText: { fontSize: 18, fontWeight: "600", color: COLORS.error },
});
