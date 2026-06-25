import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // We don't throw at import time so the server can still boot for routes
    // that don't need Twilio (helps local dev). Routes that need a value will
    // surface a clear error instead.
    console.warn(`[env] Missing environment variable: ${name}`);
    return "";
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret",
  seedCreditCents: Number(process.env.SEED_CREDIT_CENTS ?? 500),
  twilio: {
    accountSid: required("TWILIO_ACCOUNT_SID"),
    apiKey: required("TWILIO_API_KEY"),
    apiSecret: required("TWILIO_API_SECRET"),
    twimlAppSid: required("TWILIO_TWIML_APP_SID"),
    verifyServiceSid: required("TWILIO_VERIFY_SERVICE_SID"),
    callerId: required("TWILIO_CALLER_ID"),
  },
};
