import { describe, expect, it, vi } from "vitest";
import { LiveNotes, type LiveNotesHost } from "./live-notes.svelte";
import type { Sermon } from "../domain/types";

function setup(tidy: LiveNotesHost["tidy"] = async ({ notes, heard }) => `${notes}\n- ${heard}`.trim()) {
  let sermon: Sermon = { id: "s1", title: "Faith that works", speaker: "", notes: "", sections: [], updatedAt: "" };
  let listening = false;
  const host: LiveNotesHost = {
    sermon: (id) => (id === sermon.id ? sermon : undefined),
    save: async (next) => void (sermon = next),
    listening: () => listening,
    startListening: async () => void (listening = true),
    canTidy: () => true,
    tidy: vi.fn(tidy),
  };
  const notes = new LiveNotes(host);
  return { notes, host, get sermon() { return sermon; }, get listening() { return listening; } };
}

describe("live sermon notes", () => {
  it("starts listening, keeps every word heard with the sermon, and offers the AI's version to accept", async () => {
    const run = setup();
    await run.notes.start("s1");
    expect(run.listening).toBe(true);
    run.notes.hear("turn with me to James 2");
    run.notes.hear("faith without works is dead");
    expect(run.notes.words).toBe(11);
    await run.notes.tidy();
    expect(run.sermon.live?.transcript).toBe("turn with me to James 2 faith without works is dead");
    expect(run.notes.suggestion).toBe("- turn with me to James 2 faith without works is dead");
    await run.notes.accept();
    expect(run.sermon.live?.notes).toBe("- turn with me to James 2 faith without works is dead");
    expect(run.notes.suggestion).toBeNull();
    run.notes.close();
  });

  it("gives the words of a dismissed version back, so the next one still covers them", async () => {
    const run = setup();
    await run.notes.start("s1");
    run.notes.hear("first point");
    await run.notes.tidy();
    run.notes.dismiss();
    run.notes.hear("second point");
    await run.notes.tidy();
    expect(run.host.tidy).toHaveBeenLastCalledWith({ title: "Faith that works", notes: "", heard: "first point second point" });
    run.notes.close();
  });

  it("loses no words when the AI fails, and says why", async () => {
    const run = setup(async () => {
      throw new Error("The AI is busy.");
    });
    await run.notes.start("s1");
    run.notes.hear("grace through faith");
    await run.notes.tidy();
    expect(run.notes.error).toBe("The AI is busy.");
    run.notes.hear("not by works");
    (run.host.tidy as ReturnType<typeof vi.fn>).mockImplementation(async ({ heard }: { heard: string }) => heard);
    await run.notes.tidy();
    expect(run.notes.suggestion).toBe("grace through faith not by works");
    run.notes.close();
  });

  it("still lets the last version be accepted after notes stop", async () => {
    const run = setup();
    await run.notes.start("s1");
    for (let i = 0; i < 40; i++) run.notes.hear("amen and amen");
    await run.notes.stop();
    expect(run.notes.active).toBe(false);
    expect(run.notes.suggestion).not.toBeNull();
    await run.notes.accept();
    expect(run.sermon.live?.notes).toContain("amen and amen");
  });
});
