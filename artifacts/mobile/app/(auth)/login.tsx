import { useLogin } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const loginMutation = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const isValid = email.trim().length > 0 && password.length >= 4;

  const handleLogin = async () => {
    if (!isValid || loginMutation.isPending) return;
    setError(null);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await loginMutation.mutateAsync({ data: { email: email.trim(), password } });
      await login(result.token);
    } catch {
      setError("Credenciales inválidas. Verifica email y contraseña.");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingTop: topPad + 32 }]}>
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={[styles.logoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.logoMono, { color: colors.primary }]}>MDM</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Control Remoto
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Gestión Android TV
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, {
              backgroundColor: colors.background,
              borderColor: error ? colors.destructive : colors.border,
              color: colors.foreground,
              fontFamily: "Inter_400Regular",
            }]}
            placeholder="Email"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="input-email"
          />
          <TextInput
            ref={passwordRef}
            style={[styles.input, {
              backgroundColor: colors.background,
              borderColor: error ? colors.destructive : colors.border,
              color: colors.foreground,
              fontFamily: "Inter_400Regular",
            }]}
            placeholder="Contraseña"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            returnKeyType="done"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            onSubmitEditing={handleLogin}
            testID="input-password"
          />

          {error && (
            <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
              {error}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: isValid ? colors.primary : colors.muted,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            onPress={handleLogin}
            disabled={!isValid || loginMutation.isPending}
            testID="button-login"
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Iniciar Sesión
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Usa las mismas credenciales del panel web
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 24,
  },
  logoArea: {
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoMono: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
  },
  title: {
    fontSize: 24,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  form: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  input: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    height: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 12,
    textAlign: "center",
  },
});
