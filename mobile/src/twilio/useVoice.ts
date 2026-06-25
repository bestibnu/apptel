import { useCallback, useEffect, useRef, useState } from "react";
import { AudioDevice, Call, Voice } from "@twilio/voice-react-native-sdk";
import { api } from "../api/client";

export type CallStatus =
  | "idle"
  | "connecting"
  | "ringing"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface UseVoiceResult {
  status: CallStatus;
  durationSec: number;
  muted: boolean;
  speaker: boolean;
  error: string | null;
  startCall: (toNumber: string) => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
}

/**
 * Wraps the Twilio Voice React Native SDK for a single active outbound call.
 * Fetches a fresh access token from the backend, connects, and exposes call
 * controls plus a live duration timer.
 */
export function useVoice(sessionToken: string | null): UseVoiceResult {
  const voiceRef = useRef<Voice | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!voiceRef.current) {
    voiceRef.current = new Voice();
  }

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => setDurationSec((s) => s + 1), 1000);
  }, [stopTimer]);

  const attachCallListeners = useCallback(
    (call: Call) => {
      call.on(Call.Event.Ringing, () => setStatus("ringing"));
      call.on(Call.Event.Connected, () => {
        setStatus("connected");
        setDurationSec(0);
        startTimer();
      });
      call.on(Call.Event.Reconnecting, () => setStatus("reconnecting"));
      call.on(Call.Event.Reconnected, () => setStatus("connected"));
      call.on(Call.Event.Disconnected, () => {
        setStatus("disconnected");
        stopTimer();
        callRef.current = null;
      });
      call.on(Call.Event.ConnectFailure, (err: unknown) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Call failed to connect");
        stopTimer();
        callRef.current = null;
      });
    },
    [startTimer, stopTimer]
  );

  const startCall = useCallback(
    async (toNumber: string) => {
      if (!sessionToken) {
        setError("You are not signed in.");
        setStatus("error");
        return;
      }
      try {
        setError(null);
        setStatus("connecting");
        setMuted(false);
        setSpeaker(false);

        const { token } = await api.getVoiceToken(sessionToken);
        const call = await voiceRef.current!.connect(token, {
          params: { To: toNumber },
        });
        callRef.current = call;
        attachCallListeners(call);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to start the call");
      }
    },
    [sessionToken, attachCallListeners]
  );

  const hangUp = useCallback(async () => {
    try {
      await callRef.current?.disconnect();
    } catch {
      // ignore
    } finally {
      stopTimer();
      setStatus("disconnected");
      callRef.current = null;
    }
  }, [stopTimer]);

  const toggleMute = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    try {
      await call.mute(next);
      setMuted(next);
    } catch {
      // ignore
    }
  }, [muted]);

  const toggleSpeaker = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice) return;
    try {
      const next = !speaker;
      const devices = await voice.getAudioDevices();
      const list = devices.audioDevices ?? [];
      const wanted = list.find((d) =>
        next ? d.type === AudioDevice.Type.Speaker : d.type === AudioDevice.Type.Earpiece
      );
      if (wanted) {
        await wanted.select();
        setSpeaker(next);
      }
    } catch {
      // Audio routing is best-effort across platforms.
    }
  }, [speaker]);

  useEffect(() => {
    return () => {
      stopTimer();
      callRef.current?.disconnect().catch(() => {});
    };
  }, [stopTimer]);

  return { status, durationSec, muted, speaker, error, startCall, hangUp, toggleMute, toggleSpeaker };
}
