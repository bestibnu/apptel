import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, type RateRow } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { probeInternet } from "../../src/net/probe";
import { startAccessCall } from "../../src/util/accessCall";
import { formatMoney, formatRate, toE164 } from "../../src/util/format";
import { colors, radius, spacing } from "../../src/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "<"];

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
  const [number, setNumber] = useState("+");
  const [rates, setRates] = useState<RateRow[]>([]);
  const [connecting, setConnecting] = useState(false);

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

  // One button, channel chosen transparently: a quick reachability probe routes
  // a good connection to VoIP, otherwise we use the local access-number flow
  // over the phone network. The user never picks a channel — they just call.
  const onCall = useCallback(async () => {
    if (!callable || connecting) return;
    setConnecting(true);
    try {
      const { reachable } = await probeInternet();
      if (reachable) {
        router.push({ pathname: "/call", params: { to: e164, fallback: "1" } });
      } else {
        await startAccessCall(token, e164);
      }
    } finally {
      setConnecting(false);
    }
  }, [callable, connecting, router, token, e164]);

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
        <Pressable
          style={[styles.callButton, (!callable || connecting) && styles.callDisabled]}
          onPress={onCall}
          disabled={!callable || connecting}
        >
          <Text style={styles.callText}>{connecting ? "Connecting…" : "Call"}</Text>
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
  display: { alignItems: "center", paddingVertical: spacing.md },
  number: { color: colors.text, fontSize: 34, fontWeight: "700" },
  rate: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.md,
  },
  key: {
    width: "30%",
    aspectRatio: 1.7,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { color: colors.text, fontSize: 26, fontWeight: "600" },
  actions: { marginTop: "auto", gap: spacing.sm },
  callButton: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  callDisabled: { opacity: 0.4 },
  callText: { color: "#04210f", fontSize: 18, fontWeight: "800" },
});
