import { handleOAuthCallback } from "@/lib/services/oauthCallback.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const provider = String((await params).provider || "").toLowerCase();
  return handleOAuthCallback(request, provider);
}
