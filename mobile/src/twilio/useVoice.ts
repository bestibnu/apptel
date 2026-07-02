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
  // Speaker choice made before the call connects; applied once audio exists.
  const speakerWantedRef = useRef(false);

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

  /** Route audio to speaker/earpiece. Safe to call only once audio is up. */
  const applySpeaker = useCallback(async (on: boolean): Promise<boolean> => {
    const voice = voiceRef.current;
    if (!voice) return false;
    try {
      const devices = await voice.getAudioDevices();
      const list = devices.audioDevices ?? [];
      const wanted = list.find((d) =>
        on ? d.type === AudioDevice.Type.Speaker : d.type === AudioDevice.Type.Earpiece
      );
      if (!wanted) return false;
      await wanted.select();
      return true;
    } catch {
      return false;
    }
  }, []);

  const attachCallListeners = useCallback(
    (call: Call) => {
      call.on(Call.Event.Ringing, () => setStatus("ringing"));
      call.on(Call.Event.Connected, () => {
        setStatus("connected");
        setDurationSec(0);
        startTimer();
        // Honour a speaker choice made while dialing/ringing, now that the
        // audio session actually exists.
        if (speakerWantedRef.current) {
          applySpeaker(true).catch(() => {});
        }
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
    [startTimer, stopTimer, applySpeaker]
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
        speakerWantedRef.current = false;

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
    const next = !speaker;
    // Before the call connects there may be no audio session to route yet, so
    // remember the choice and reflect it in the UI; it's applied on connect.
    speakerWantedRef.current = next;
    setSpeaker(next);
    if (callRef.current) {
      const ok = await applySpeaker(next);
      if (!ok && status === "connected") setSpeaker(!next);
    }
  }, [speaker, status, applySpeaker]);

  useEffect(() => {
    return () => {
      stopTimer();
      callRef.current?.disconnect().catch(() => {});
    };
  }, [stopTimer]);

  return { status, durationSec, muted, speaker, error, startCall, hangUp, toggleMute, toggleSpeaker };
}
