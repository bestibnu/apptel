import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { RATES } from "../lib/rates.js";

export const walletRouter = Router();

/** Current balance plus the rate table (so the app can show per-country pricing). */
walletRouter.get("/", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  return res.json({
    balanceCents: user.balanceCents,
    rates: RATES.map((r) => ({
      prefix: `+${r.prefix}`,
      country: r.country,
      ratePerMinCents: r.ratePerMinCents,
    })),
  });
});

/** Mock top-up: add credit directly to the wallet (no real payment in this MVP). */
walletRouter.post("/topup", requireAuth, async (req, res) => {
  const amountCents = Number(req.body?.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 100000) {
    return res.status(400).json({ error: "amountCents must be a positive number up to 100000" });
  }
  const user = await prisma.user.update({
    where: { id: req.session!.userId },
    data: { balanceCents: { increment: Math.round(amountCents) } },
  });
  return res.json({ balanceCents: user.balanceCents });
});
