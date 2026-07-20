import "dotenv/config";

/**
 * LINE integration
 * -----------------
 * LINE Notify (the service this project's original design referenced) was
 * permanently discontinued by LINE on March 31, 2025. This module uses its
 * official replacement, the LINE Messaging API "push message" endpoint,
 * which requires a LINE Official Account + Channel Access Token instead of
 * a per-tenant Notify token.
 *
 * Setup:
 *  1. Create a LINE Official Account + Messaging API channel at
 *     https://developers.line.biz/console/
 *  2. Issue a long-lived channel access token and put it in .env as
 *     LINE_CHANNEL_ACCESS_TOKEN.
 *  3. Each tenant must add your Official Account as a friend, then send
 *     your channel a message once so you can capture their LINE userId
 *     (e.g. via a webhook, or by having them paste their LIFF-provided
 *     userId in the "LINE Register" page). This starter stores that
 *     userId manually per room — wiring up a full LIFF login flow is a
 *     follow-up step, noted in the README.
 */

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export async function sendLineMessage(lineUserId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured on the server." };
  }
  if (!lineUserId) {
    return { ok: false, error: "This room has no LINE user ID on file." };
  }
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `LINE API error ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Unknown error calling LINE API" };
  }
}
