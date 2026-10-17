import { describe, expect, it } from "vitest";
import { licenseKeyPair, looksLikeLicense, normalizeLicense, readLicense, signLicense } from "./license";

describe("license keys", () => {
  const pair = licenseKeyPair();

  it("round-trips plan, dates, days and holder", () => {
    const key = signLicense({ plan: "premium", until: "2027-10-31", holder: "Grace Chapel Accra" }, pair.secretKey);
    expect(key.startsWith("CS1")).toBe(true);
    expect(looksLikeLicense(key)).toBe(true);
    expect(readLicense(key, pair.publicKey)).toMatchObject({ plan: "premium", until: "2027-10-31T23:59:59.999Z", days: null, holder: "Grace Chapel Accra" });
    expect(readLicense(signLicense({ plan: "church", days: 30 }, pair.secretKey), pair.publicKey)).toMatchObject({ plan: "church", until: null, days: 30, holder: "" });
  });

  it("survives retyping: case, spaces, dashes and look-alike letters", () => {
    const key = signLicense({ plan: "premium" }, pair.secretKey);
    const messy = ` ${key.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l")} `;
    expect(normalizeLicense(messy)).toBe(normalizeLicense(key));
    expect(readLicense(messy, pair.publicKey)?.plan).toBe("premium");
  });

  it("refuses a changed character, a truncated key, or another signer", () => {
    const key = normalizeLicense(signLicense({ plan: "premium", holder: "A" }, pair.secretKey));
    const flipped = key.slice(0, 8) + (key[8] === "2" ? "3" : "2") + key.slice(9);
    expect(readLicense(flipped, pair.publicKey)).toBeNull();
    expect(readLicense(key.slice(0, -4), pair.publicKey)).toBeNull();
    expect(readLicense(key, licenseKeyPair().publicKey)).toBeNull();
    expect(readLicense("PREMIUM-TEST", pair.publicKey)).toBeNull();
  });

  it("caps the holder name at 40 bytes", () => {
    const key = signLicense({ plan: "premium", holder: "x".repeat(90) }, pair.secretKey);
    expect(readLicense(key, pair.publicKey)?.holder).toBe("x".repeat(40));
  });
});
