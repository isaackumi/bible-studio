import { describe, expect, it } from "vitest";
import {
  approvePending,
  createPairing,
  declinePending,
  emptyRemoteGate,
  framePayload,
  pairingUrl,
  readRemoteEnvelope,
  REMOTE_CODE_ATTEMPTS,
  REMOTE_PAIR_MS,
  REMOTE_SESSION_MS,
  remoteEnvelope,
  revokeDevice,
  routeRemote,
  sanitizeRemoteDevices,
  type RemoteContext,
  type RemoteGate,
} from "./remote";

const HASH = "a".repeat(64);
let counter = 0;
const ctx = (now: number, tokenHash: string | null = null): RemoteContext => ({
  now,
  tokenHash,
  newId: () => `req-${++counter}`,
  newSecret: () => `secret-${counter}`,
});

function opened(now = 1_000): RemoteGate {
  return { ...emptyRemoteGate(), pairing: createPairing(now, "123456", "qr-token") };
}

describe("phone remote pairing", () => {
  it("needs operator approval before a QR scan gets a session token", () => {
    let gate = opened();
    const asked = routeRemote(gate, remoteEnvelope("pair", { pair: "qr-token", name: "Ama's iPhone" }), ctx(2_000));
    expect(asked.reply.type).toBe("pending");
    gate = asked.gate;
    const { request, secret } = asked.reply.payload;
    expect(gate.pending[0]).toMatchObject({ name: "Ama's iPhone", status: "waiting" });

    const waiting = routeRemote(gate, remoteEnvelope("pair-status", { request: request!, secret: secret! }), ctx(3_000));
    expect(waiting.reply.type).toBe("pending");

    gate = approvePending(gate, request!, "session-token", HASH, 4_000);
    const welcome = routeRemote(gate, remoteEnvelope("pair-status", { request: request!, secret: secret! }), ctx(5_000));
    expect(welcome.reply).toEqual(remoteEnvelope("welcome", { token: "session-token" }));
    expect(welcome.gate.pending).toEqual([]);
    expect(welcome.gate.devices[0]).toMatchObject({ name: "Ama's iPhone", tokenHash: HASH });
    // The token is handed out once.
    expect(routeRemote(welcome.gate, remoteEnvelope("pair-status", { request: request!, secret: secret! }), ctx(6_000)).reply.type).toBe("expired");
  });

  it("uses the QR token once and rejects a wrong request secret", () => {
    const first = routeRemote(opened(), remoteEnvelope("pair", { pair: "qr-token" }), ctx(2_000));
    const again = routeRemote(first.gate, remoteEnvelope("pair", { pair: "qr-token" }), ctx(2_100));
    expect(again.reply.type).toBe("denied");
    const stolen = routeRemote(first.gate, remoteEnvelope("pair-status", { request: first.reply.payload.request!, secret: "guess" }), ctx(2_200));
    expect(stolen.reply.type).toBe("expired");
  });

  it("expires pairing and closes it after too many wrong codes", () => {
    expect(routeRemote(opened(0), remoteEnvelope("pair", { pair: "qr-token" }), ctx(REMOTE_PAIR_MS + 1)).reply.type).toBe("expired");
    let gate = opened(0);
    for (let attempt = 1; attempt < REMOTE_CODE_ATTEMPTS; attempt += 1) {
      const wrong = routeRemote(gate, remoteEnvelope("pair", { code: "000000" }), ctx(10));
      expect(wrong.reply.type).toBe("denied");
      gate = wrong.gate;
    }
    const last = routeRemote(gate, remoteEnvelope("pair", { code: "000000" }), ctx(10));
    expect(last.reply.type).toBe("expired");
    expect(last.gate.pairing).toBeNull();
    expect(routeRemote(last.gate, remoteEnvelope("pair", { code: "123456" }), ctx(11)).reply.type).toBe("expired");
  });

  it("tells a declined phone it is unauthorized", () => {
    const asked = routeRemote(opened(), remoteEnvelope("pair", { code: "123456" }), ctx(2_000));
    const gate = declinePending(asked.gate, asked.reply.payload.request!);
    const status = routeRemote(gate, remoteEnvelope("pair-status", asked.reply.payload), ctx(3_000));
    expect(status.reply.type).toBe("unauthorized");
  });
});

describe("paired phone messages", () => {
  function paired(now = 0): RemoteGate {
    const asked = routeRemote(opened(now), remoteEnvelope("pair", { code: "123456", name: "Phone" }), ctx(now));
    return approvePending(asked.gate, asked.reply.payload.request!, "t", HASH, now);
  }

  it("authorizes state and commands only for a known token hash", () => {
    const gate = paired();
    expect(routeRemote(gate, remoteEnvelope("state", {}), ctx(10, HASH)).action).toEqual({ kind: "state" });
    expect(routeRemote(gate, remoteEnvelope("command", { id: "take" }), ctx(10, HASH)).action).toEqual({ kind: "command", id: "take" });
    expect(routeRemote(gate, remoteEnvelope("command", { id: "take" }), ctx(10, "b".repeat(64))).reply.type).toBe("unauthorized");
    expect(routeRemote(gate, remoteEnvelope("state", {}), ctx(10, null)).reply.type).toBe("unauthorized");
    expect(routeRemote(gate, remoteEnvelope("command", { id: "format-disk" }), ctx(10, HASH)).reply.type).toBe("denied");
  });

  it("keeps a used session alive and expires an idle one", () => {
    const gate = paired(0);
    const used = routeRemote(gate, remoteEnvelope("state", {}), ctx(REMOTE_SESSION_MS - 10, HASH));
    expect(used.reply.type).toBe("state");
    expect(routeRemote(used.gate, remoteEnvelope("state", {}), ctx(REMOTE_SESSION_MS * 2 - 20, HASH)).reply.type).toBe("state");
    expect(routeRemote(gate, remoteEnvelope("state", {}), ctx(REMOTE_SESSION_MS + 1, HASH)).reply.type).toBe("unauthorized");
  });

  it("revokes one phone", () => {
    const before = paired();
    const gate = revokeDevice(before, before.devices[0]!.id);
    expect(routeRemote(gate, remoteEnvelope("state", {}), ctx(10, HASH)).reply.type).toBe("unauthorized");
  });

  it("routes Preview-only picks", () => {
    const gate = paired();
    expect(routeRemote(gate, remoteEnvelope("preview-item", { itemId: "i1" }), ctx(1, HASH)).action).toEqual({ kind: "preview-item", itemId: "i1" });
    expect(routeRemote(gate, remoteEnvelope("preview-scene", { sceneId: "s1" }), ctx(1, HASH)).action).toEqual({ kind: "preview-scene", sceneId: "s1" });
  });
});

describe("remote wire format", () => {
  it("puts only the one-time pairing token in the QR URL", () => {
    expect(pairingUrl("192.168.1.20", "abc/+=")).toBe("http://192.168.1.20:17891/?pair=abc%2F%2B%3D");
  });

  it("reads only current-protocol envelopes with string payloads", () => {
    expect(readRemoteEnvelope({ v: 2, type: "state", payload: { token: "x", n: 3 } })).toEqual(remoteEnvelope("state", { token: "x" }));
    expect(readRemoteEnvelope({ v: 1, type: "pair", payload: {} })).toBeNull();
  });

  it("keeps only well-formed stored devices", () => {
    expect(sanitizeRemoteDevices([{ id: "d", name: " Pad ", tokenHash: HASH, pairedAt: 1, lastSeen: 2, expiresAt: 3 }, { id: "x", tokenHash: "short" }])).toEqual([
      { id: "d", name: "Pad", tokenHash: HASH, pairedAt: 1, lastSeen: 2, expiresAt: 3 },
    ]);
  });

  it("summarises a frame for the phone", () => {
    expect(framePayload("program", { layout: "black", reference: null, attribution: null, lines: [] })).toMatchObject({ programCue: "Black", programLayout: "black" });
  });
});

describe("controller keys (Stream Deck, scripts)", async () => {
  const { controllerDevice, commandUrl, pruneRemoteGate, routeRemote, remoteEnvelope } = await import("./remote");
  it("never expire, and run commands like a paired phone", () => {
    const device = controllerDevice("c1", "Stream Deck", "a".repeat(64), 1000);
    const gate = pruneRemoteGate({ pairing: null, pending: [], devices: [device] }, 10 ** 13);
    expect(gate.devices).toHaveLength(1);
    const routed = routeRemote(gate, remoteEnvelope("command", { id: "next-item", token: "x" }), { now: 5000, tokenHash: "a".repeat(64), newId: () => "n", newSecret: () => "s" });
    expect(routed.action).toEqual({ kind: "command", id: "next-item" });
    expect(routed.gate.devices[0]?.expiresAt).toBe(device.expiresAt);
    expect(routeRemote(gate, remoteEnvelope("command", { id: "next", token: "y" }), { now: 5000, tokenHash: "b".repeat(64), newId: () => "n", newSecret: () => "s" }).action).toBeNull();
  });

  it("builds one-click button links", () => {
    expect(commandUrl("http://192.168.1.20:17891/", "take", "ab+c")).toBe("http://192.168.1.20:17891/v1/command/take?token=ab%2Bc");
  });
});

describe("stage links", () => {
  it("read the stage and press nothing", async () => {
    const { routeRemote, stageDevice, remoteEnvelope, pruneRemoteGate } = await import("./remote");
    const device = stageDevice("d1", "Band iPad", "a".repeat(64), 1);
    const gate = { pairing: null, devices: [device], pending: [] };
    const ctx = { now: 10_000_000_000, tokenHash: "a".repeat(64), newId: () => "x", newSecret: () => "y" };
    expect(routeRemote(gate, remoteEnvelope("stage", { token: "t" }), ctx).action).toEqual({ kind: "stage" });
    const pressed = routeRemote(gate, remoteEnvelope("command", { token: "t", id: "take" }), ctx);
    expect(pressed.action).toBeNull();
    expect(pressed.reply.type).toBe("denied");
    expect(routeRemote(gate, remoteEnvelope("state", { token: "t" }), ctx).action).toBeNull();
    // Never expires like a phone does.
    expect(pruneRemoteGate(gate, ctx.now).devices).toHaveLength(1);
  });
});
