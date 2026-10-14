import { describe, expect, it } from "vitest";
import { normalizeWorkspace } from "./document";

describe("workspace document", () => {
  it("restores an older workspace document without inventing a live program", () => {
    const workspace = normalizeWorkspace({
      churchName: "Grace",
      logoAssetId: null,
      logoText: "Grace",
      themeId: "theme-manuscript",
      lastServiceId: "svc-1",
      recent: [],
      cursor: { sectionId: "opening", itemId: "welcome" },
      shortcuts: null,
    });
    expect(workspace.churchName).toBe("Grace");
    expect(workspace.cursor).toEqual({ sectionId: "opening", itemId: "welcome" });
    expect(workspace.lastServiceId).toBe("svc-1");
    expect(workspace.layouts.map((layout) => layout.id)).toEqual(["layout-bible", "layout-production", "layout-simple"]);
    expect(workspace.activeLayoutId).toBe("layout-bible");
    expect(workspace.schemaVersion).toBe(2);
    expect(workspace).not.toHaveProperty("program");
  });

  it("replaces a corrupt layout list and an invalid accent", () => {
    const workspace = normalizeWorkspace({
      churchName: "Grace",
      layouts: [{ id: "", name: "" }],
      appearance: { theme: "light", density: "compact", scale: 9, accent: "red" },
    });
    expect(workspace.layouts).toHaveLength(3);
    expect(workspace.appearance).toMatchObject({ theme: "light", density: "compact", scale: 1.35, accent: "#fa4f00", desk: "pewbeam" });
  });

  it("moves the previous factory accent onto Signal", () => {
    const workspace = normalizeWorkspace({ appearance: { theme: "dark", density: "comfortable", scale: 1, accent: "#c6a15b" } });
    expect(workspace.appearance.accent).toBe("#fa4f00");
    expect(workspace.appearance.desk).toBe("pewbeam");
  });

  it("keeps an OBS desk choice", () => {
    const workspace = normalizeWorkspace({ appearance: { theme: "dark", density: "comfortable", scale: 1, accent: "#fa4f00", desk: "obs" } });
    expect(workspace.appearance.desk).toBe("obs");
  });
});
