import { describe, expect, it } from "vitest";
import { presentQr, sanitizeAlert, withAlert } from "./overlays";
import { defaultTheme, emptyModel } from "./theme";

describe("QR frames", () => {
  it("paints a code with safe colors and style, or nothing when empty", () => {
    const qr = presentQr({ theme: defaultTheme(), data: " https://church.org/give ", style: "dots", dark: "red", caption: "Give online" });
    expect(qr.layout).toBe("qr");
    expect(qr.qr).toEqual({ data: "https://church.org/give", style: "dots", dark: "#000000", light: "#ffffff", caption: "Give online" });
    expect(presentQr({ theme: defaultTheme(), data: "  " }).layout).toBe("empty");
  });
});

describe("Program alerts", () => {
  it("cleans text and options and drops expired or empty alerts", () => {
    expect(sanitizeAlert({ text: "  Parent of #34   to the nursery ", style: "ticker", position: "top", until: 5_000 }, 1_000)).toEqual({
      id: "alert:1000",
      text: "Parent of #34 to the nursery",
      style: "ticker",
      position: "top",
      until: 5_000,
    });
    expect(sanitizeAlert({ text: "x", until: 500 }, 1_000)).toBeNull();
    expect(sanitizeAlert({ text: "   " })).toBeNull();
  });

  it("adds and removes the alert on a frame without touching anything else", () => {
    const frame = emptyModel(defaultTheme());
    const alert = sanitizeAlert({ text: "Car lights on: AB-123" }, 1)!;
    const shown = withAlert(frame, alert);
    expect(shown.alert).toEqual(alert);
    expect(withAlert(shown, alert)).toBe(shown);
    expect(withAlert(shown, null)).toEqual(frame);
    expect(withAlert(frame, null)).toBe(frame);
  });
});
