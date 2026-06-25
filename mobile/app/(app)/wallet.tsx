import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, type RateRow } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { formatMoney } from "../../src/util/format";
import { colors, radius, spacing } from "../../src/theme";

const TOPUP_OPTIONS = [500, 1000, 2000];

export default function WalletScreen() {
  const { token, user, updateUser, signOut } = useAuth();
  const [rates, setRates] = useState<RateRow[]>([]);
  const [busy, setBusy] = useState(false);

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

  const topUp = async (amountCents: number) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await api.topUp(token, amountCents);
      updateUser({ balanceCents: res.balanceCents });
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current balance</Text>
        <Text style={styles.balance}>{formatMoney(user?.balanceCents ?? 0)}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
      </View>

      <Text style={styles.sectionTitle}>Add credit (mock)</Text>
      <View style={styles.topupRow}>
        {TOPUP_OPTIONS.map((amt) => (
          <Pressable
            key={amt}
            style={[styles.topupBtn, busy && styles.disabled]}
            onPress={() => topUp(amt)}
            disabled={busy}
          >
            <Text style={styles.topupText}>{formatMoney(amt)}</Text>
          </Pressable>
        ))}
      </View>
      {busy ? <ActivityIndicator color={colors.primary} /> : null}

      <Text style={styles.sectionTitle}>Rates</Text>
      <FlatList
        style={styles.list}
        data={rates}
        keyExtractor={(r) => r.prefix}
        renderItem={({ item }) => (
          <View style={styles.rateRow}>
            <Text style={styles.rateCountry}>{item.country}</Text>
            <Text style={styles.ratePrefix}>{item.prefix}</Text>
            <Text style={styles.rateValue}>{(item.ratePerMinCents / 100).toFixed(2)}/min</Text>
          </View>
        )}
      />

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  cardLabel: { color: colors.textMuted, fontSize: 14 },
  balance: { color: colors.success, fontSize: 40, fontWeight: "800", marginVertical: spacing.xs },
  phone: { color: colors.textMuted, fontSize: 14 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: spacing.sm },
  topupRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  topupBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  topupText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  list: { flex: 1 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rateCountry: { color: colors.text, fontSize: 15, flex: 1 },
  ratePrefix: { color: colors.textMuted, fontSize: 14, width: 60 },
  rateValue: { color: colors.text, fontSize: 15, fontWeight: "600" },
  signOut: { alignItems: "center", paddingVertical: spacing.md },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
});
