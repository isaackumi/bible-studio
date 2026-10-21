import { describe, expect, it } from "vitest";
import { licenseKeyEmail, signInEmail } from "./email";

describe("emails", () => {
  it("sends the sign-in link as a branded page with a button, and as plain text", () => {
    const email = signInEmail("https://license.heitechinc.com/auth/magic?token=a&b=<x>", "https://license.heitechinc.com");
    expect(email.subject).toBe("Sign in to Church Studio");
    expect(email.html).toContain('src="https://license.heitechinc.com/email/logo.png"');
    expect(email.html).toContain("Sign in to Church Studio</a>");
    expect(email.html).toContain("token=a&amp;b=&lt;x&gt;");
    expect(email.html).not.toContain("<x>");
    expect(email.text).toContain("https://license.heitechinc.com/auth/magic?token=a&b=<x>");
  });

  it("puts a license key in a box, with how to add it", () => {
    const email = licenseKeyEmail({ key: "CS1-ABCD", plan: "church", added: true }, "https://keys.test/");
    expect(email.subject).toBe("Your Church Studio Church license key");
    expect(email.html).toContain("CS1-ABCD");
    expect(email.html).toContain("https://keys.test/email/logo.png");
    expect(email.text).toContain("already added it");
  });
});
