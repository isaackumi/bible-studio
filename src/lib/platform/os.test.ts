import { describe, expect, it } from "vitest";
import { computerOs, keys, revealLabel } from "./os";

describe("the computer's own words", () => {
  it("tells Windows, Mac and Linux apart from the browser's description", () => {
    expect(computerOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0")).toBe("windows");
    expect(computerOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("mac");
    expect(computerOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")).toBe("linux");
    expect(computerOs("")).toBe("other");
  });

  it("writes shortcuts with Ctrl and Shift off a Mac, and keeps ⌘ on a Mac", () => {
    expect(keys("Go to anything (⌘K)", "windows")).toBe("Go to anything (Ctrl+K)");
    expect(keys("Strikethrough (⌘⇧X)", "windows")).toBe("Strikethrough (Ctrl+Shift+X)");
    expect(keys("Redo (⇧⌘Z)", "linux")).toBe("Redo (Shift+Ctrl+Z)");
    expect(keys("⌘,", "windows")).toBe("Ctrl+,");
    expect(keys("scroll to pan, ⌘+scroll to zoom", "windows")).toBe("scroll to pan, Ctrl+scroll to zoom");
    expect(keys("⌘G groups them, ⌘⇧G ungroups.", "windows")).toBe("Ctrl+G groups them, Ctrl+Shift+G ungroups.");
    expect(keys("Bold (⌘B)", "mac")).toBe("Bold (⌘B)");
  });

  it("names the file browser of each computer", () => {
    expect(revealLabel("mac")).toBe("Show in Finder");
    expect(revealLabel("windows")).toBe("Show in File Explorer");
    expect(revealLabel("linux")).toBe("Show in folder");
  });
});
