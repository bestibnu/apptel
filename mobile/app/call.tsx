import { useEffect, useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthContext";
import { useVoice, type CallStatus } from "../src/twilio/useVoice";
import { startAccessCall } from "../src/util/accessCall";
import { formatDuration } from "../src/util/format";
import { colors, radius, spacing } from "../src/theme";

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Preparing...",
  connecting: "Connecting...",
  ringing: "Ringing...",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  disconnected: "Call ended",
  error: "Call failed",
};

export default function CallScreen() {
  const router = useRouter();
  const { to, fallback } = useLocalSearchParams<{ to: string; fallback?: string }>();
  const { token } = useAuth();
  const { status, durationSec, muted, speaker, error, startCall, hangUp, toggleMute, toggleSpeaker } =
    useVoice(token);
  const started = useRef(false);
  const fallbackPrompted = useRef(false);

  useEffect(() => {
    if (started.current || !to) return;
    started.current = true;
    startCall(to);
  }, [to, startCall]);

  useEffect(() => {
    // VoIP couldn't connect: if this call was eligible for fallback, offer the
    // no-internet route (phone network) instead of just bailing out.
    if (status === "error" && fallback === "1" && !fallbackPrompted.current) {
      fallbackPrompted.current = true;
      Alert.alert(
        "Internet call failed",
        "Your connection looks weak. Call without internet instead? It uses your normal phone plan.",
        [
          { text: "Cancel", style: "cancel", onPress: () => router.back() },
          {
            text: "Call without internet",
            onPress: async () => {
              await startAccessCall(token, to ?? "");
              router.back();
            },
          },
        ]
      );
      return;
    }

    if (status === "disconnected" || status === "error") {
      const t = setTimeout(() => router.back(), 1500);
      return () => clearTimeout(t);
    }
  }, [status, fallback, router, token, to]);

  const isActive = status === "connected" || status === "reconnecting";
  // Speaker can be chosen while dialing/ringing (applied once audio connects);
  // mute only makes sense with a live audio stream.
  const speakerUsable = isActive || status === "connecting" || status === "ringing";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text style={styles.to}>{to}</Text>
        <Text style={styles.status}>{STATUS_LABEL[status]}</Text>
        {isActive ? <Text style={styles.timer}>{formatDuration(durationSec)}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, muted && styles.controlActive]}
          onPress={toggleMute}
          disabled={!isActive}
        >
          <Text style={styles.controlText}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
        <Pressable
          style={[styles.controlBtn, speaker && styles.controlActive]}
          onPress={toggleSpeaker}
          disabled={!speakerUsable}
        >
          <Text style={styles.controlText}>{speaker ? "Speaker On" : "Speaker"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.hangUp} onPress={hangUp}>
        <Text style={styles.hangUpText}>End call</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, justifyContent: "space-between", padding: spacing.lg },
  top: { alignItems: "center", marginTop: spacing.xl * 2, gap: spacing.sm },
  to: { color: colors.text, fontSize: 30, fontWeight: "800" },
  status: { color: colors.textMuted, fontSize: 18 },
  timer: { color: colors.success, fontSize: 22, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, textAlign: "center" },
  controls: { flexDirection: "row", justifyContent: "center", gap: spacing.lg },
  controlBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 120,
    alignItems: "center",
  },
  controlActive: { backgroundColor: colors.primary },
  controlText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  hangUp: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  hangUpText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
