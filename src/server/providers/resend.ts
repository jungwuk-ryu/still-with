import { getResendApiKey, getResendFromEmail } from "@/lib/env";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RESEND_REQUEST_TIMEOUT_MS = 15_000;

export interface SendResendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  timeoutMs?: number;
}

export class ResendEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendEmailError";
  }
}

export async function sendResendEmail(input: SendResendEmailInput): Promise<void> {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    throw new ResendEmailError("RESEND_API_KEY is not configured.");
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_RESEND_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: getResendFromEmail(),
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ResendEmailError(
        `Resend email request failed with HTTP ${response.status}.`
      );
    }
  } catch (error) {
    if (error instanceof ResendEmailError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new ResendEmailError(
        `Resend email request timed out after ${timeoutMs / 1000} seconds.`
      );
    }

    throw new ResendEmailError(
      error instanceof Error ? error.message : "Resend email request failed."
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
