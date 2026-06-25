import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/api/client";
import { toE164 } from "../../src/util/format";
import { colors, radius, spacing } from "../../src/theme";

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    const e164 = toE164(phone);
    if (e164.length < 8) {
      setError("Enter a valid phone number with country code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.startVerify(e164);
      router.push({ pathname: "/(auth)/otp", params: { phone: e164 } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Apptel</Text>
          <Text style={styles.subtitle}>Low-cost international calling</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Your phone number</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 202 555 0123"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoFocus
            value={phone}
            onChangeText={setPhone}
          />
          <Text style={styles.hint}>Include your country code, e.g. +1, +44, +91.</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: spacing.xl },
  logo: { color: colors.text, fontSize: 40, fontWeight: "800", letterSpacing: 0.5 },
  subtitle: { color: colors.textMuted, fontSize: 16, marginTop: spacing.xs },
  form: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 20,
  },
  hint: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, marginTop: spacing.xs },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: "700" },
});
