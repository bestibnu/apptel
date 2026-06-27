import { Alert, Linking } from "react-native";
import { api } from "../api/client";

/**
 * Registers a no-internet (access-number) call intent on the backend, then
 * prompts the user to dial the local access number from their normal phone
 * plan. Shared by the dialer's "no internet" route and the VoIP-failure
 * fallback so both behave identically.
 */
export async function startAccessCall(token: string | null, e164: string): Promise<void> {
  if (!token) {
    Alert.alert("Not signed in", "Please sign in again to place a call.");
    return;
  }
  try {
    const res = await api.prepareAccessCall(token, e164);
    Alert.alert(
      "Call without internet",
      `Dial ${res.accessNumber} from your phone now to connect to ${e164}.\n\nThis uses your normal call plan (charged as a local call) — no data or Wi-Fi needed. The setup expires in 5 minutes.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open dialer", onPress: () => Linking.openURL(`tel:${res.accessNumber}`) },
      ]
    );
  } catch (err) {
    Alert.alert("Couldn't set up call", err instanceof Error ? err.message : "Please try again.");
  }
}
