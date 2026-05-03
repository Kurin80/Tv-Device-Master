import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  StatusBar,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
import * as Device from "expo-device";

type Screen = "scanning" | "enrolling" | "success" | "error";

interface QRPayload {
  enrollUrl: string;
  token: string;
}

interface EnrolledDevice {
  id: string;
  name: string;
  ip: string;
  tenantId: string;
  status: string;
}

const COLORS = {
  background: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  primary: "#3b82f6",
  primaryFg: "#ffffff",
  foreground: "#f8fafc",
  muted: "#94a3b8",
  success: "#22c55e",
  error: "#ef4444",
  overlay: "rgba(0,0,0,0.6)",
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("scanning");
  const [permission, requestPermission] = useCameraPermissions();
  const [enrolledDevice, setEnrolledDevice] = useState<EnrolledDevice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const scannedRef = useRef(false);

  const reset = () => {
    scannedRef.current = false;
    setEnrolledDevice(null);
    setErrorMsg("");
    setScreen("scanning");
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScreen("enrolling");

    try {
      let payload: QRPayload;
      try {
        payload = JSON.parse(data) as QRPayload;
      } catch {
        throw new Error("QR code inválido. Asegúrate de escanear el código generado por la app MDM.");
      }

      if (!payload.enrollUrl || !payload.token) {
        throw new Error("QR code incompleto. Genera un nuevo código en la app MDM.");
      }

      const ip = await Network.getIpAddressAsync();
      if (!ip || ip === "0.0.0.0") {
        throw new Error("No se pudo obtener la dirección IP. Verifica que el TV esté conectado a la red.");
      }

      const deviceName =
        Device.deviceName ||
        Device.modelName ||
        "Android TV";

      const response = await fetch(payload.enrollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: payload.token,
          name: deviceName,
          ip,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Error del servidor: ${response.status}`);
      }

      const device = await response.json() as EnrolledDevice;
      setEnrolledDevice(device);
      setScreen("success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setErrorMsg(message);
      setScreen("error");
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.hint}>Iniciando cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Text style={styles.body}>
          La app necesita acceso a la cámara para escanear el código QR de inscripción.
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
              Apunta la cámara al código QR mostrado en la app MDM
            </Text>
            <Text style={styles.subInstructions}>
              El dispositivo se inscribirá automáticamente al escanear
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

  if (screen === "success" && enrolledDevice) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={[styles.title, { color: COLORS.success }]}>
          ¡Inscripción exitosa!
        </Text>
        <View style={styles.deviceCard}>
          <Row label="Dispositivo" value={enrolledDevice.name} />
          <Row label="Dirección IP" value={enrolledDevice.ip} />
          <Row label="ID" value={enrolledDevice.id} />
        </View>
        <Text style={styles.body}>
          Este TV ya aparece en el panel de administración MDM.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={reset}>
          <Text style={styles.secondaryBtnText}>Inscribir otro dispositivo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>✗</Text>
      <Text style={[styles.title, { color: COLORS.error }]}>
        Error de inscripción
      </Text>
      <Text style={styles.body}>{errorMsg}</Text>
      <Pressable style={styles.primaryBtn} onPress={reset}>
        <Text style={styles.primaryBtnText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    gap: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    flexDirection: "column",
  },
  topBar: {
    paddingHorizontal: 48,
    paddingTop: 32,
    paddingBottom: 16,
    alignItems: "center",
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.foreground,
    letterSpacing: 1,
  },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    width: 240,
    height: 240,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: COLORS.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  bottomBar: {
    paddingHorizontal: 48,
    paddingBottom: 40,
    paddingTop: 16,
    alignItems: "center",
    gap: 8,
  },
  instructions: {
    fontSize: 22,
    fontWeight: "600",
    color: COLORS.foreground,
    textAlign: "center",
  },
  subInstructions: {
    fontSize: 16,
    color: COLORS.muted,
    textAlign: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: COLORS.foreground,
    textAlign: "center",
  },
  body: {
    fontSize: 20,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 30,
    maxWidth: 600,
  },
  hint: {
    fontSize: 18,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 16,
  },
  icon: {
    fontSize: 72,
  },
  successIcon: {
    fontSize: 80,
    color: COLORS.success,
    fontWeight: "700",
  },
  errorIcon: {
    fontSize: 80,
    color: COLORS.error,
    fontWeight: "700",
  },
  deviceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    width: "100%",
    maxWidth: 560,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 18,
    color: COLORS.muted,
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 18,
    color: COLORS.foreground,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 16,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primaryFg,
  },
  secondaryBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  secondaryBtnText: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.muted,
  },
});
