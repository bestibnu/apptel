import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { createVoiceToken } from "../lib/twilio.js";
import { costForCall, findRate } from "../lib/rates.js";
import { requireAuth } from "../auth/middleware.js";
import { setIntent, consumeIntent } from "../lib/callIntents.js";

export const voiceRouter = Router();

const VoiceResponse = twilio.twiml.VoiceResponse;
const E164 = /^\+[1-9]\d{6,14}$/;

type TwimlResponse = InstanceType<typeof VoiceResponse>;
type AppUser = { id: string; balanceCents: number };

/**
 * Appends either a <Dial> to the destination (if the user has credit) or a
 * spoken error to the TwiML response, and records the call for cost
 * reconciliation. Shared by the VoIP (/twiml) and access-number (/incoming) flows.
 */
async function appendDial(response: TwimlResponse, user: AppUser, to: string): Promise<void> {
  const { ratePerMinCents } = findRate(to);
  if (user.balanceCents < ratePerMinCents) {
    response.say("You do not have enough credit to make this call. Please top up and try again.");
    return;
  }

  // Record the call so the status callback can reconcile cost later.
  await prisma.callRecord.create({
    data: { userId: user.id, toNumber: to, ratePerMin: ratePerMinCents, status: "initiated" },
  });

  const statusCallback = env.publicBaseUrl ? `${env.publicBaseUrl}/voice/status` : undefined;

  const dial = response.dial({
    callerId: env.twilio.callerId,
    answerOnBridge: true,
    // Abuse guard: hard-stop a call after the configured maximum so a stuck or
    // fraudulent call can't drain credit indefinitely.
    timeLimit: env.maxCallSeconds,
  });
  dial.number(
    statusCallback
      ? {
          statusCallback,
          statusCallbackEvent: ["completed"],
          statusCallbackMethod: "POST",
        }
      : {},
    to
  );
}

/** Mint a Twilio Voice access token for the authenticated user. */
voiceRouter.get("/token", requireAuth, (req, res) => {
  const userId = req.session!.userId;
  const token = createVoiceToken(userId);
  return res.json({ token, identity: userId });
});

/**
 * TwiML App Voice webhook. Twilio calls this when the SDK initiates an outbound
 * call. `From` is the token identity (our userId); `To` is the dialed number.
 * We verify the user has credit, then return TwiML that dials the destination.
 */
voiceRouter.post("/twiml", async (req, res) => {
  const response = new VoiceResponse();
  const to: string | undefined = req.body?.To;
  // Twilio sends the SDK client's identity as `From` in the form "client:<identity>".
  // Our token identity is the user's id, so strip the prefix to recover it.
  const fromRaw: string | undefined = req.body?.From;
  const userId = fromRaw?.startsWith("client:") ? fromRaw.slice("client:".length) : fromRaw;

  if (!to) {
    response.say("No destination number was provided. Goodbye.");
    res.type("text/xml").send(response.toString());
    return;
  }

  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) {
    response.say("Your account could not be found. Goodbye.");
    res.type("text/xml").send(response.toString());
    return;
  }

  await appendDial(response, user, to);
  res.type("text/xml").send(response.toString());
});

/**
 * Access-number (no-internet) flow, step 1: the app registers which number the
 * user wants to call. The user then dials the shared local access number from
 * their regular phone (a normal cellular call, not VoIP), which hits /incoming.
 */
voiceRouter.post("/access/prepare", requireAuth, async (req, res) => {
  const to: unknown = req.body?.to;
  if (typeof to !== "string" || !E164.test(to)) {
    return res.status(400).json({ error: "to must be an E.164 number, e.g. +919600774779" });
  }
  if (!env.twilio.callerId) {
    return res.status(503).json({ error: "Access number is not configured" });
  }

  const phone = req.session!.phone;
  const user = await prisma.user.findUnique({ where: { id: req.session!.userId } });
  if (!user) {
    return res.status(404).json({ error: "Account not found" });
  }
  const { ratePerMinCents, country } = findRate(to);
  if (user.balanceCents < ratePerMinCents) {
    return res.status(402).json({ error: "Insufficient credit. Please top up." });
  }

  setIntent(phone, to);
  return res.json({
    accessNumber: env.twilio.callerId,
    to,
    country,
    ratePerMinCents,
    expiresInSeconds: 300,
  });
});

/**
 * Access-number (no-internet) flow, step 2: Twilio webhook for inbound calls to
 * the access number. We match the caller's number (From) to a pending intent
 * and bridge the call to the intended destination.
 */
voiceRouter.post("/incoming", async (req, res) => {
  const response = new VoiceResponse();
  const from: string | undefined = req.body?.From;

  const to = from ? consumeIntent(from) : null;
  if (!to) {
    response.say(
      "We could not find a pending call. Please set up your call in the app first, then dial this number."
    );
    res.type("text/xml").send(response.toString());
    return;
  }

  const user = from ? await prisma.user.findUnique({ where: { phone: from } }) : null;
  if (!user) {
    response.say("Your account could not be found. Goodbye.");
    res.type("text/xml").send(response.toString());
    return;
  }

  await appendDial(response, user, to);
  res.type("text/xml").send(response.toString());
});

/**
 * Status callback fired by Twilio when the dialed leg completes. We compute the
 * cost from the call duration and deduct it from the user's wallet.
 */
voiceRouter.post("/status", async (req, res) => {
  const to: string | undefined = req.body?.To;
  const callStatus: string | undefined = req.body?.CallStatus;
  const durationSec = Number(req.body?.CallDuration ?? 0);
  const callSid: string | undefined = req.body?.CallSid;

  res.sendStatus(204); // ack immediately; reconcile below

  if (!to || callStatus !== "completed") return;

  try {
    // Find the most recent initiated record for this destination.
    const record = await prisma.callRecord.findFirst({
      where: { toNumber: to, status: "initiated" },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return;

    const { costCents } = costForCall(to, durationSec);

    await prisma.$transaction([
      prisma.callRecord.update({
        where: { id: record.id },
        data: { durationSec, costCents, callSid, status: "completed" },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { balanceCents: { decrement: costCents } },
      }),
    ]);
  } catch (err: any) {
    console.error("[voice/status]", err?.message ?? err);
  }
});
