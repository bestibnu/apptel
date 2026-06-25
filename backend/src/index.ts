import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { voiceRouter } from "./routes/voice.js";
import { walletRouter } from "./routes/wallet.js";

const app = express();

app.use(cors());
app.use(express.json());
// Twilio posts webhooks as application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/voice", voiceRouter);
app.use("/wallet", walletRouter);

app.listen(env.port, () => {
  console.log(`apptel backend listening on http://localhost:${env.port}`);
  if (!env.publicBaseUrl) {
    console.warn("[warn] PUBLIC_BASE_URL is not set; call cost reconciliation (statusCallback) will be skipped.");
  }
});
