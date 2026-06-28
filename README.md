# Apptel — Rebtel-style International Calling MVP

A minimal but real international calling app: phone + SMS OTP signup, an
international dialer, live outbound calls through **Twilio Programmable Voice**,
and a **mock prepaid wallet** (balance + per-minute rates, credits deducted
after each call).

```
apptel/
├── backend/   Node + Express + TypeScript API (Prisma + SQLite)
└── mobile/    Expo (React Native) app — Expo Router + TypeScript
```

> The mobile app uses Twilio's native Voice SDK, so it must run as an **Expo dev
> build** (`expo run:ios` / `expo run:android`). It will **not** work in Expo Go.

---

## How it works

```
Phone OTP (Twilio Verify)  ->  JWT session
Dialer  ->  GET /voice/token  ->  Voice.connect(To=+number)
            -> Twilio hits POST /voice/twiml (checks credit, returns <Dial>)
            -> call connects to the real phone
            -> POST /voice/status fires on completion -> deduct credit
```

---

## 1. Twilio Console setup (one-time)

You need a Twilio account. For each item below, copy the value into
`backend/.env` (see step 2).

1. **Account SID** — Console dashboard → `TWILIO_ACCOUNT_SID`.
2. **API Key** — Console → Account → *API keys & tokens* → *Create API key*
   (Standard). Save the **SID** (`TWILIO_API_KEY`) and **Secret**
   (`TWILIO_API_SECRET`).
3. **Phone number** — Console → Phone Numbers → buy a voice-capable number.
   Use it as `TWILIO_CALLER_ID` (E.164, e.g. `+12025550123`).
4. **TwiML App** — Console → Voice → TwiML → *TwiML Apps* → create one.
   Set its **Voice Request URL** to `<PUBLIC_BASE_URL>/voice/twiml` (POST).
   Save the **SID** as `TWILIO_TWIML_APP_SID`.
5. **Verify Service** — Console → Verify → *Services* → create one.
   Save the **SID** as `TWILIO_VERIFY_SERVICE_SID`.

> **Trial accounts**: you can only call **verified** numbers, calls are prefixed
> with a trial message, and you must verify your own number first.

---

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # then fill in your Twilio values
npx prisma migrate dev      # creates the SQLite db (already run once)
npm run dev                 # starts http://localhost:3000
```

### Expose the backend to Twilio (for webhooks)

Twilio must reach `/voice/twiml` and `/voice/status` over the public internet.
In a second terminal:

```bash
ngrok http 3000
```

Then:
- Put the `https://…ngrok-free.app` URL into `backend/.env` as `PUBLIC_BASE_URL`
  (used for the call-completion status callback that deducts credit).
- Put `https://…ngrok-free.app/voice/twiml` into your **TwiML App → Voice
  Request URL**.
- Restart `npm run dev` after editing `.env`.

### API surface

| Method | Path                 | Auth | Purpose                                  |
| ------ | -------------------- | ---- | ---------------------------------------- |
| POST   | `/auth/start-verify` | —    | Send SMS OTP (`{ phone }`)               |
| POST   | `/auth/check-verify` | —    | Verify OTP, return JWT (`{ phone, code }`) |
| GET    | `/voice/token`         | JWT  | Mint a Twilio Voice access token         |
| POST   | `/voice/twiml`         | —*   | Twilio webhook: credit check + `<Dial>`  |
| POST   | `/voice/status`        | —*   | Twilio webhook: deduct credit on hang-up |
| POST   | `/voice/access/prepare`| JWT  | No-internet flow: register destination (`{ to }`) |
| POST   | `/voice/incoming`      | —*   | Twilio webhook: bridge prepared call, or prompt for digits (DTMF) |
| POST   | `/voice/incoming/connect`| —* | Twilio webhook: bridge call to DTMF-entered number |
| GET    | `/wallet`              | JWT  | Balance + rate table                     |
| POST   | `/wallet/topup`        | JWT  | Mock add credit (`{ amountCents }`)      |

`*` Called by Twilio, not the app.

#### No-internet calling (access-number / two-stage dialing)

For networks that block VoIP, the app supports a Rebtel-style flow that uses the
regular phone network instead of data. There are two variants:

**A. App-prepared (works with intermittent data):**

1. App calls `POST /voice/access/prepare` with the destination → backend stores a
   short-lived intent keyed by the caller's phone, and returns the access number.
2. User dials the access number from their normal phone (a plain cellular call).
3. Twilio hits `POST /voice/incoming`; the backend matches the caller's number to
   the pending intent and bridges the call to the destination.

**B. Zero-data (DTMF two-stage dialing — no app or data needed at all):**

1. User dials the access number directly from their phone's native dialer.
2. Twilio hits `POST /voice/incoming`. With no pending intent, the backend
   identifies the caller by their number and returns a `<Gather>` that prompts
   them to key in the destination (country code first, then `#`).
3. The entered digits are posted to `POST /voice/incoming/connect`, which
   validates the number, checks credit, and bridges the call.

To enable both, set the **"A Call Comes In"** Voice webhook of your Twilio number
(the one used as `TWILIO_CALLER_ID`) to `<PUBLIC_BASE_URL>/voice/incoming` (POST).
The `/voice/incoming/connect` callback is invoked automatically by the `<Gather>`.

---

## 3. Mobile app

```bash
cd mobile
npm install --legacy-peer-deps
```

### Point the app at your backend

Edit `mobile/app.json` → `expo.extra.apiBaseUrl`:

- **Android emulator**: `http://10.0.2.2:3000` (default)
- **iOS simulator**: `http://localhost:3000`
- **Physical device**: `http://<your-computer-LAN-IP>:3000` (same Wi-Fi)

### Run a dev build on a device/emulator

```bash
npx expo run:android      # needs Android Studio + an emulator/device
# or
npx expo run:ios          # needs Xcode (macOS) + a simulator/device
```

This compiles the native Twilio Voice SDK into a custom dev client. After the
first build you can iterate with `npm start`.

---

## 4. End-to-end test

1. Backend running + `ngrok` up + TwiML App URL set.
2. Launch the app → enter **your** phone number (E.164) → receive the SMS code →
   verify. New accounts start with seeded credit (default $5.00).
3. Open **Wallet** → tap a top-up amount if you want more mock credit.
4. Open **Dialer** → type a destination number (with country code) → **Call**.
5. Your phone rings via Twilio; talk, then **End call**.
6. Back on the dialer/wallet, the balance drops by `rate × minutes`.

---

## Configuration reference (`backend/.env`)

| Variable                    | What it is                                            |
| --------------------------- | ----------------------------------------------------- |
| `PORT`                      | Backend port (default 3000)                           |
| `PUBLIC_BASE_URL`           | Public URL of the backend (your ngrok https URL)      |
| `JWT_SECRET`                | Secret for signing session tokens                     |
| `TWILIO_ACCOUNT_SID`        | Twilio Account SID (`AC…`)                            |
| `TWILIO_API_KEY`            | Twilio API Key SID (`SK…`)                            |
| `TWILIO_API_SECRET`         | Twilio API Key secret                                 |
| `TWILIO_TWIML_APP_SID`      | TwiML App SID (`AP…`)                                 |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service SID (`VA…`)                            |
| `TWILIO_CALLER_ID`          | Your Twilio phone number, E.164 (also the access number) |
| `SEED_CREDIT_CENTS`         | Credit granted to new users (default 500 = £5.00)     |
| `MAX_CALL_SECONDS`          | Per-call hard cap, abuse guard (default 3600 = 60 min) |

---

## Not included (clear next steps)

- Real payments (Stripe) — the wallet is mock top-up only.
- Device contacts import and a call-history screen.
- Text messaging / SMS.
- Incoming app-to-app calls (needs push credentials + APNs/FCM and
  `googleServicesFile` in `app.json`).
- Pre-call hard balance enforcement is best-effort; production should reserve
  credit and stream call progress to cut off calls that exceed the balance.
```
