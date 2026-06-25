import { Router } from "express";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { twilioClient } from "../lib/twilio.js";
import { signSession } from "../auth/jwt.js";

export const authRouter = Router();

const E164 = /^\+[1-9]\d{6,14}$/;

/** Send an SMS OTP to the given phone number via Twilio Verify. */
authRouter.post("/start-verify", async (req, res) => {
  const { phone } = req.body ?? {};
  if (typeof phone !== "string" || !E164.test(phone)) {
    return res.status(400).json({ error: "phone must be an E.164 number, e.g. +12025550123" });
  }
  try {
    await twilioClient.verify.v2
      .services(env.twilio.verifyServiceSid)
      .verifications.create({ to: phone, channel: "sms" });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[start-verify]", err?.message ?? err);
    return res.status(502).json({ error: "Failed to send verification code" });
  }
});

/** Check the OTP. On success, upsert the user (seeding credit for new users) and return a JWT. */
authRouter.post("/check-verify", async (req, res) => {
  const { phone, code } = req.body ?? {};
  if (typeof phone !== "string" || !E164.test(phone)) {
    return res.status(400).json({ error: "phone must be an E.164 number" });
  }
  if (typeof code !== "string" || code.length < 4) {
    return res.status(400).json({ error: "code is required" });
  }

  try {
    const check = await twilioClient.verify.v2
      .services(env.twilio.verifyServiceSid)
      .verificationChecks.create({ to: phone, code });

    if (check.status !== "approved") {
      return res.status(401).json({ error: "Incorrect or expired code" });
    }

    const existing = await prisma.user.findUnique({ where: { phone } });
    const user =
      existing ??
      (await prisma.user.create({
        data: { phone, balanceCents: env.seedCreditCents },
      }));

    const token = signSession({ userId: user.id, phone: user.phone });
    return res.json({
      token,
      user: { id: user.id, phone: user.phone, balanceCents: user.balanceCents },
      isNew: !existing,
    });
  } catch (err: any) {
    console.error("[check-verify]", err?.message ?? err);
    return res.status(502).json({ error: "Failed to verify code" });
  }
});
