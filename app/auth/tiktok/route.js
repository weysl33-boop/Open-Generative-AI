import { handleOAuthCallback } from "@/lib/services/oauthCallback.js";

export const runtime = "nodejs";

export async function GET(request) {
  return handleOAuthCallback(request, "tiktok");
}
