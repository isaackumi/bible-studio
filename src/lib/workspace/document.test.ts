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
    expect(workspace.pew).toMatchObject({ focus: false, columns: [46, 30, 24] });
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

  it("keeps a named operator theme", () => {
    const workspace = normalizeWorkspace({ appearance: { theme: "vespers", density: "comfortable", scale: 1, accent: "#fa4f00" } });
    expect(workspace.appearance.theme).toBe("vespers");
  });

  it("drops an unknown operator theme", () => {
    const workspace = normalizeWorkspace({ appearance: { theme: "neon", density: "comfortable", scale: 1, accent: "#fa4f00" } });
    expect(workspace.appearance.theme).toBe("dark");
  });

  it("keeps a saved shortcut map and fills desk keys that older documents omit", () => {
    const workspace = normalizeWorkspace({
      shortcuts: {
        take: ["KeyT"],
        cut: ["KeyC"],
        previous: ["ArrowLeft"],
        next: ["ArrowRight"],
        clear: ["Backspace"],
        black: ["KeyB"],
        logo: ["KeyL"],
        escape: ["Escape"],
      },
    });
    expect(workspace.shortcuts?.take).toEqual(["KeyT"]);
    expect(workspace.shortcuts?.focus).toEqual(["KeyF"]);
    expect(workspace.shortcuts?.find).toEqual(["Slash"]);
  });

  it("keeps an OBS desk choice", () => {
    const workspace = normalizeWorkspace({ appearance: { theme: "dark", density: "comfortable", scale: 1, accent: "#fa4f00", desk: "obs" } });
    expect(workspace.appearance.desk).toBe("obs");
  });
});
