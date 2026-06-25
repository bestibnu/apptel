import Constants from "expo-constants";

/**
 * Base URL of the backend API.
 *
 * Defaults per platform when running a dev build:
 *  - Android emulator reaches the host machine at 10.0.2.2
 *  - iOS simulator / a physical device on the same LAN should use your machine's
 *    LAN IP (set it in app.json -> expo.extra.apiBaseUrl).
 */
export const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "http://localhost:3000";
