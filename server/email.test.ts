import { describe, expect, it } from "vitest";
import { inviteEmail, licenseKeyEmail, signInEmail } from "./email";

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

  it("invites someone by name and church, with the steps and the address to sign in with", () => {
    const email = inviteEmail({ inviter: "Pastor <James>", inviterEmail: "james@grace.org", church: "Grace Chapel", to: "bob@grace.org", plan: "church" }, "https://keys.test");
    expect(email.subject).toBe("Pastor <James> invited you to Grace Chapel on Church Studio");
    expect(email.html).toContain("Pastor &lt;James&gt;");
    expect(email.html).not.toContain("<James>");
    expect(email.html).toContain('href="https://keys.test/#download"');
    expect(email.text).toContain("Sign in with this email address: bob@grace.org");
    expect(email.text).toContain("james@grace.org");
    expect(email.text).toContain("No license key");
  });
});
