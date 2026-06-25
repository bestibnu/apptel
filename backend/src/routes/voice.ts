import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { createVoiceToken } from "../lib/twilio.js";
import { costForCall, findRate } from "../lib/rates.js";
import { requireAuth } from "../auth/middleware.js";

export const voiceRouter = Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

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

  const { ratePerMinCents } = findRate(to);
  if (user.balanceCents < ratePerMinCents) {
    response.say("You do not have enough credit to make this call. Please top up and try again.");
    res.type("text/xml").send(response.toString());
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
