import twilio from "twilio";
import { env } from "../env.js";

const { jwt } = twilio;
const AccessToken = jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

/** Shared REST client (uses Account SID + Auth via API key pair). */
export const twilioClient = twilio(env.twilio.apiKey, env.twilio.apiSecret, {
  accountSid: env.twilio.accountSid,
});

/**
 * Mint a Voice access token for a given app user.
 * The token's identity is the user's id so inbound webhooks can map calls back
 * to the user (the SDK sends it as the `From` param of the TwiML request).
 */
export function createVoiceToken(identity: string): string {
  const token = new AccessToken(
    env.twilio.accountSid,
    env.twilio.apiKey,
    env.twilio.apiSecret,
    { identity, ttl: 3600 }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: env.twilio.twimlAppSid,
    incomingAllow: false,
  });

  token.addGrant(voiceGrant);
  return token.toJwt();
}

export { twilio };
