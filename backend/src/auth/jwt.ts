import jsonwebtoken from "jsonwebtoken";
import { env } from "../env.js";

export interface SessionPayload {
  userId: string;
  phone: string;
}

export function signSession(payload: SessionPayload): string {
  return jsonwebtoken.sign(payload, env.jwtSecret, { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload {
  return jsonwebtoken.verify(token, env.jwtSecret) as SessionPayload;
}
