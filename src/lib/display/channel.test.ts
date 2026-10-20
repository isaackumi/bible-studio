import { describe, expect, it } from "vitest";
import { acceptProgramPacket, claimOwner, parseStage, parseStandby, publishTo, readPacket, type OutputOwner, type PacketStore } from "./channel";
import { createLiveState, frame, programPacket } from "../domain/live";
import { defaultTheme, emptyModel } from "../domain/theme";
import type { ProgramPacket } from "../domain/types";

function memory(): PacketStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const theme = defaultTheme();

function packet(sessionId: string, generation: number, revision: number): ProgramPacket {
  return { ...programPacket(createLiveState(theme), 450), sessionId, generation, revision };
}

const owner = (sessionId: string, generation: number): OutputOwner => ({ sessionId, generation });

describe("program ownership", () => {
  it("lets the owner clear on startup and ignores an older revision", () => {
    const first = packet("operator-a", 1, 2);
    expect(acceptProgramPacket(null, first, owner("operator-a", 1))).toBe(true);
    expect(acceptProgramPacket(first, packet("operator-a", 1, 1), owner("operator-a", 1))).toBe(false);
    expect(acceptProgramPacket(first, packet("operator-a", 1, 0), owner("operator-a", 1))).toBe(true);
    expect(acceptProgramPacket(first, packet("operator-b", 1, 9), owner("operator-a", 1))).toBe(false);
  });

  it("does not let a second session publish until it claims control", () => {
    const store = memory();
    claimOwner(store, "operator-a");
    expect(publishTo(store, packet("operator-a", 1, 2))).toBe(true);
    expect(publishTo(store, packet("operator-b", 1, 9))).toBe(false);
    expect(readPacket(store)?.revision).toBe(2);
    const claimed = claimOwner(store, "operator-b");
    expect(claimed.generation).toBe(2);
    expect(publishTo(store, packet("operator-a", 1, 8))).toBe(false);
    expect(publishTo(store, packet("operator-b", 2, 1))).toBe(true);
    expect(readPacket(store)?.sessionId).toBe("operator-b");
  });

  it("publishes an empty program frame rather than a preview frame", () => {
    const published = programPacket(createLiveState(theme), theme.transition.ms);
    expect(published.frame).toEqual(frame(emptyModel(theme), null, "cut"));
  });

  it("leaves the stored packet alone when storage rejects the write", () => {
    const store = memory();
    claimOwner(store, "operator-a");
    publishTo(store, packet("operator-a", 1, 2));
    const failing: PacketStore = {
      getItem: (key) => store.getItem(key),
      setItem: () => {
        throw new Error("disk full");
      },
    };
    expect(() => publishTo(failing, packet("operator-a", 1, 3))).toThrow("disk full");
    expect(readPacket(store)?.revision).toBe(2);
  });
});

describe("camera standby", () => {
  it("keeps only camera source ids and survives bad input", () => {
    expect(parseStandby(JSON.stringify(["camera:a", "scripture:x", 3, "camera:b"]))).toEqual(["camera:a", "camera:b"]);
    expect(parseStandby(null)).toEqual([]);
    expect(parseStandby("{nope")).toEqual([]);
    expect(parseStandby(JSON.stringify({ a: 1 }))).toEqual([]);
  });
});

describe("stage snapshot", () => {
  it("accepts a whole snapshot and rejects partial or broken ones", () => {
    const model = emptyModel(defaultTheme());
    const snapshot = { program: model, next: model, live: true, desk: "Grace", at: 1 };
    // Older desks send no message or layout: the stage fills in the defaults.
    expect(parseStage(JSON.stringify(snapshot))).toEqual({ ...snapshot, message: "", notes: "", layout: { next: true, clock: true, notes: true, chords: true, size: "m" } });
    const withMessage = { ...snapshot, message: "Wrap up", layout: { next: false, clock: true, notes: false, size: "l" } };
    expect(parseStage(JSON.stringify(withMessage))).toMatchObject({ message: "Wrap up", layout: { next: false, size: "l" } });
    expect(parseStage(JSON.stringify({ program: model, at: 1 }))).toBeNull();
    expect(parseStage("{oops")).toBeNull();
    expect(parseStage(null)).toBeNull();
  });
});
