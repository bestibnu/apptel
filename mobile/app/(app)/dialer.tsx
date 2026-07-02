import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, type RateRow } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { probeInternet } from "../../src/net/probe";
import { startAccessCall } from "../../src/util/accessCall";
import { formatMoney, formatRate, parsePastedNumber } from "../../src/util/format";
import { colors, radius, spacing } from "../../src/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "<"];

// Shown until the wallet's rate table loads; US first since it's the corridor origin.
const DEFAULT_COUNTRIES: RateRow[] = [{ prefix: "1", country: "US / Canada", ratePerMinCents: 2 }];

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
  // `number` holds either national digits (country chip applies) or a full
  // "+<cc>..." string when the user typed/pasted their own country code.
  const [number, setNumber] = useState("");
  const [rates, setRates] = useState<RateRow[]>([]);
  const [countryPrefix, setCountryPrefix] = useState("1");
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

  const countries = rates.length > 0 ? rates : DEFAULT_COUNTRIES;
  const explicitIntl = number.startsWith("+");

  const onKey = (k: string) => {
    setNumber((prev) => {
      if (k === "<") return prev.slice(0, -1);
      if (k === "+") return prev === "" ? "+" : prev;
      return prev + k;
    });
  };

  // Fires on long-press -> Paste (typing is disabled; keypad handles that).
  const onChangeText = (text: string) => {
    const parsed = parsePastedNumber(text);
    if (!parsed) {
      setNumber("");
      return;
    }
    setNumber(parsed.international ? "+" + parsed.digits : parsed.digits);
  };

  // Safeguard: a bare national number always gets the selected country's code,
  // so a forgotten "+1"/"+91" can never turn into a call to the wrong country.
  const e164 = useMemo(() => {
    const digits = number.replace(/[^\d]/g, "");
    if (!digits) return "";
    return explicitIntl ? "+" + digits : "+" + countryPrefix + digits;
  }, [number, explicitIntl, countryPrefix]);

  const matched = useMemo(() => (e164 ? rateFor(e164, rates) : null), [e164, rates]);
  const longEnough = e164.replace(/[^\d]/g, "").length >= 8;
  // Safeguard: destinations we don't price are blocked instead of guessed at.
  const callable = longEnough && matched !== null;

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

  const hint = !longEnough
    ? explicitIntl
      ? "Enter the number after the country code"
      : "Enter the phone number"
    : matched
    ? `${matched.country} - ${formatRate(matched.ratePerMinCents)}`
    : "This destination isn't supported yet";

  return (
    <View style={styles.container}>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceValue}>{formatMoney(user?.balanceCents ?? 0)}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.countryScroll}
        contentContainerStyle={styles.countryRow}
      >
        {countries.map((c) => {
          const active = !explicitIntl && countryPrefix === c.prefix.replace(/[^\d]/g, "");
          return (
            <Pressable
              key={c.prefix}
              style={[styles.countryChip, active && styles.countryChipActive]}
              onPress={() => {
                setCountryPrefix(c.prefix.replace(/[^\d]/g, ""));
                // Selecting a country switches back to national-number mode.
                if (explicitIntl) setNumber("");
              }}
            >
              <Text style={[styles.countryChipText, active && styles.countryChipTextActive]}>
                {c.country} +{c.prefix.replace(/[^\d]/g, "")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.display}>
        <TextInput
          style={styles.number}
          value={explicitIntl ? number : number ? `+${countryPrefix} ${number}` : ""}
          onChangeText={onChangeText}
          placeholder={`+${countryPrefix} …`}
          placeholderTextColor={colors.textMuted}
          showSoftInputOnFocus={false}
          autoCorrect={false}
          numberOfLines={1}
        />
        <Text style={[styles.rate, longEnough && !matched && styles.rateWarn]}>{hint}</Text>
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
  container: { flex: 1, padding: spacing.lg, gap: spacing.sm },
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
  countryScroll: { flexGrow: 0 },
  countryRow: { gap: spacing.sm },
  countryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  countryChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  countryChipTextActive: { color: colors.primaryText },
  display: { alignItems: "center", paddingVertical: spacing.sm },
  number: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    minWidth: "80%",
    padding: 0,
  },
  rate: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  rateWarn: { color: colors.danger },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
  },
  key: {
    width: "30%",
    aspectRatio: 1.9,
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
