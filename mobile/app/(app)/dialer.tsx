import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, type RateRow } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { useCallMode, type CallMode } from "../../src/prefs/callMode";
import { probeInternet } from "../../src/net/probe";
import { startAccessCall } from "../../src/util/accessCall";
import { formatMoney, formatRate, toE164 } from "../../src/util/format";
import { colors, radius, spacing } from "../../src/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "<"];

const MODE_OPTIONS: { value: CallMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "internet", label: "Internet" },
  { value: "no-internet", label: "No internet" },
];

const MODE_CAPTION: Record<CallMode, string> = {
  auto: "Uses the internet when available, otherwise your phone network.",
  internet: "Calls over the internet (uses mobile data).",
  "no-internet": "Calls via your phone network — no data needed.",
};

function rateFor(e164: string, rates: RateRow[]): RateRow | null {
  const digits = e164.replace(/[^\d]/g, "");
  let best: RateRow | null = null;
  for (const r of rates) {
    const prefix = r.prefix.replace(/[^\d]/g, "");
    if (digits.startsWith(prefix)) {
      if (!best || prefix.length > best.prefix.replace(/[^\d]/g, "").length) best = r;
    }
  }
  return best;
}

export default function DialerScreen() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();
  const { mode, setMode } = useCallMode();
  const [number, setNumber] = useState("+");
  const [rates, setRates] = useState<RateRow[]>([]);
  const [deciding, setDeciding] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    api
      .getWallet(token)
      .then((w) => {
        setRates(w.rates);
        updateUser({ balanceCents: w.balanceCents });
      })
      .catch(() => {});
  }, [token, updateUser]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onKey = (k: string) => {
    setNumber((prev) => {
      if (k === "<") return prev.length > 1 ? prev.slice(0, -1) : "+";
      if (k === "+") return prev.includes("+") ? prev : "+" + prev;
      return prev + k;
    });
  };

  const e164 = useMemo(() => toE164(number), [number]);
  const matched = useMemo(() => rateFor(e164, rates), [e164, rates]);
  const callable = e164.replace(/[^\d]/g, "").length >= 7;

  const placeVoip = useCallback(() => {
    router.push({ pathname: "/call", params: { to: e164, fallback: "1" } });
  }, [router, e164]);

  // Single entry point. The route is chosen from the user's preference and, in
  // Auto mode, a quick reachability probe: good internet -> VoIP, otherwise the
  // local access-number flow over the phone network.
  const onCall = useCallback(async () => {
    if (!callable || deciding) return;

    if (mode === "no-internet") {
      await startAccessCall(token, e164);
      return;
    }
    if (mode === "internet") {
      placeVoip();
      return;
    }

    setDeciding(true);
    try {
      const { reachable } = await probeInternet();
      if (reachable) {
        placeVoip();
      } else {
        await startAccessCall(token, e164);
      }
    } finally {
      setDeciding(false);
    }
  }, [callable, deciding, mode, token, e164, placeVoip]);

  const callLabel = deciding ? "Checking connection…" : "Call";

  return (
    <View style={styles.container}>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceValue}>{formatMoney(user?.balanceCents ?? 0)}</Text>
      </View>

      <View style={styles.display}>
        <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {number}
        </Text>
        <Text style={styles.rate}>
          {matched
            ? `${matched.country} - ${formatRate(matched.ratePerMinCents)}`
            : e164.length > 2
            ? `Other - ${formatRate(15)}`
            : "Enter a number with country code"}
        </Text>
      </View>

      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <Pressable key={k} style={styles.key} onPress={() => onKey(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <View style={styles.segment}>
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setMode(opt.value)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.caption}>{MODE_CAPTION[mode]}</Text>

        <Pressable
          style={[styles.callButton, (!callable || deciding) && styles.callDisabled]}
          onPress={onCall}
          disabled={!callable || deciding}
        >
          <Text style={styles.callText}>{callLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  balanceLabel: { color: colors.textMuted, fontSize: 14 },
  balanceValue: { color: colors.success, fontSize: 18, fontWeight: "700" },
  display: { alignItems: "center", paddingVertical: spacing.sm },
  number: { color: colors.text, fontSize: 34, fontWeight: "700" },
  rate: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
  },
  key: {
    width: "30%",
    aspectRatio: 2.1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { color: colors.text, fontSize: 26, fontWeight: "600" },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentItemActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: colors.primaryText, fontWeight: "700" },
  caption: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  callButton: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  callDisabled: { opacity: 0.4 },
  callText: { color: "#04210f", fontSize: 18, fontWeight: "800" },
});
