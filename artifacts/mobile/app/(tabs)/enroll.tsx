import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { getEnrollmentToken } from "@workspace/api-client-react";
import type { EnrollmentTokenResponse } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

const EXPIRY_MS = 15 * 60 * 1000;

export default function EnrollScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [enrollment, setEnrollment] = useState<EnrollmentTokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const fetchToken = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getEnrollmentToken();
      setEnrollment(data);
      const expiry = new Date(data.expiresAt).getTime();
      setSecondsLeft(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    } catch {
      setError("No se pudo generar el código QR. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    if (!enrollment) return;
    const interval = setInterval(() => {
      const expiry = new Date(enrollment.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setEnrollment(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [enrollment]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const qrValue = enrollment
    ? JSON.stringify({ enrollUrl: enrollment.enrollUrl, token: enrollment.token })
    : "";

  const headerTopPad = Platform.OS === "web" ? 67 : insets.top;
  const expired = !loading && !enrollment && !error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Inscribir TV
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Escanea el código QR en tu Android TV
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Generando código QR...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.offline} />
            <Text style={[styles.errorText, { color: colors.offline, fontFamily: "Inter_500Medium" }]}>
              {error}
            </Text>
            <Pressable
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={fetchToken}
            >
              <Text style={[styles.retryText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Reintentar
              </Text>
            </Pressable>
          </View>
        ) : expired ? (
          <View style={styles.centered}>
            <Ionicons name="time-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              El código QR ha expirado
            </Text>
            <Pressable
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={fetchToken}
            >
              <Text style={[styles.retryText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Generar nuevo código
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrValue}
                  size={220}
                  color="#000000"
                  backgroundColor="#ffffff"
                />
              </View>

              <View style={[styles.timerRow, { borderTopColor: colors.border }]}>
                <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.timerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Expira en{" "}
                  <Text style={{ color: secondsLeft < 60 ? colors.offline : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                    {formatTime(secondsLeft)}
                  </Text>
                </Text>
              </View>
            </View>

            <Text style={[styles.instructions, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Abre la app de inscripción MDM en tu Android TV y escanea este código. El dispositivo quedará registrado automáticamente en tu cuenta.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.refreshBtn,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={fetchToken}
              testID="button-refresh-qr"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.refreshText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Regenerar código
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  headerTitle: {
    fontSize: 28,
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  content: {
    padding: 20,
    alignItems: "center",
    gap: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: 80,
  },
  qrCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    alignSelf: "stretch",
    alignItems: "center",
  },
  qrWrapper: {
    padding: 24,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  timerText: {
    fontSize: 14,
  },
  instructions: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  hint: {
    fontSize: 15,
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
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
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  refreshText: {
    fontSize: 14,
  },
});
