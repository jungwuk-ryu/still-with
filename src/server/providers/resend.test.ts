import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "./resend";

const originalResendApiKey = process.env.RESEND_API_KEY;
const originalResendFromEmail = process.env.RESEND_FROM_EMAIL;

afterEach(() => {
  vi.unstubAllGlobals();

  if (originalResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalResendApiKey;
  }

  if (originalResendFromEmail === undefined) {
    delete process.env.RESEND_FROM_EMAIL;
  } else {
    process.env.RESEND_FROM_EMAIL = originalResendFromEmail;
  }
});

describe("sendResendEmail", () => {
  it("sends email through Resend with an abort signal", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Still With <test@example.com>";
    const fetchMock = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(url).toBe("https://api.resend.com/emails");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(null, { status: 202 });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendResendEmail({
      to: "memory@example.com",
      subject: "Ready",
      text: "Ready",
      html: "<p>Ready</p>"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal)
      })
    );
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      from: "Still With <test@example.com>",
      to: "memory@example.com",
      subject: "Ready"
    });
  });

  it("aborts stalled Resend requests", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true }
            );
          })
      )
    );

    await expect(
      sendResendEmail({
        to: "memory@example.com",
        subject: "Ready",
        text: "Ready",
        html: "<p>Ready</p>",
        timeoutMs: 1
      })
    ).rejects.toThrow("Resend email request timed out");
  });
});
