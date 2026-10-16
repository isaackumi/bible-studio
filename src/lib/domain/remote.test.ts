import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, setPreview } from "./live";
import { presentText } from "./present";
import {
  authorizeRemoteCommand,
  createPairing,
  isLanRemoteOrigin,
  isRemoteClicker,
  lanRemoteUrl,
  pairRemote,
  programCue,
  programPadPayload,
  REMOTE_COMMANDS,
  REMOTE_LAN_PORT,
  remoteEnvelope,
  routeRemote,
} from "./remote";
import { blackModel, defaultTheme } from "./theme";

const theme = defaultTheme();

function previewLive() {
  const model = presentText({ theme, layout: "title", heading: "Welcome", body: "Come in." });
  return setPreview(createLiveState(theme), frame(model, "slide-1", "cut"));
}

describe("phone remote pairing", () => {
  it("lets a paired token Take and keeps an unpaired token off Program", () => {
    const pairing = createPairing(1_000, () => "482193");
    expect(pairing.code).toBe("482193");
    expect(pairRemote(pairing, "000000", 1_001).ok).toBe(false);
    const paired = pairRemote(pairing, "482193", 1_001);
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;

    expect(authorizeRemoteCommand([], paired.token, "take")).toBeNull();
    expect(authorizeRemoteCommand([paired.token], "other", "take")).toBeNull();
    expect(authorizeRemoteCommand([paired.token], paired.token, "open-settings")).toBeNull();
    expect(authorizeRemoteCommand([paired.token], paired.token, "take")).toBe("take");

    let live = previewLive();
    const program = live.program;
    expect(authorizeRemoteCommand([], "nope", "take")).toBeNull();
    expect(live.program).toEqual(program);

    const allowed = authorizeRemoteCommand([paired.token], paired.token, "take");
    expect(allowed).toBe("take");
    if (allowed !== "take") throw new Error("The authorized remote action should be TAKE.");
    live = applyProgramAction(live, allowed, theme, { title: "Logo", imageUrl: null });
    expect(live.program.model.lines[0]?.text).toBe("Welcome");
    expect(live.program).not.toEqual(program);
  });

  it("rejects an expired code and keeps next/previous off Program", () => {
    const pairing = createPairing(1_000, () => "111111");
    expect(pairRemote(pairing, "111111", pairing.expiresAt + 1).ok).toBe(false);
    const live = previewLive();
    const program = live.program;
    expect(authorizeRemoteCommand(["tok"], "tok", "next")).toBe("next");
    expect(authorizeRemoteCommand(["tok"], "tok", "previous")).toBe("previous");
    expect(live.program).toEqual(program);
    expect(REMOTE_COMMANDS).toEqual(["take", "next", "previous", "clear", "black", "logo"]);
    const envelope = remoteEnvelope("command", { token: "tok", id: "take" });
    expect(envelope.v).toBe(1);
    expect(envelope.type).toBe("command");
  });
});

describe("LAN remote envelope", () => {
  it("names a reachable pad URL on the desk's port", () => {
    expect(REMOTE_LAN_PORT).toBe(17891);
    expect(lanRemoteUrl("192.168.1.20")).toBe("http://192.168.1.20:17891/");
    expect(isLanRemoteOrigin("http://192.168.1.20:17891/")).toBe(true);
    expect(isLanRemoteOrigin("http://127.0.0.1:1420/?remote=1")).toBe(false);
  });

  it("replies over the same v1 envelope so a LAN socket can carry pair and Take", () => {
    const pairing = createPairing(1_000, () => "482193");
    const unpaired = routeRemote({ pairing, tokens: [] }, remoteEnvelope("command", { token: "", id: "take" }), 1_001);
    expect(unpaired.command).toBeNull();
    expect(unpaired.reply.type).toBe("denied");
    expect(unpaired.session.tokens).toEqual([]);

    const wrong = routeRemote({ pairing, tokens: [] }, remoteEnvelope("pair", { code: "000000" }), 1_001);
    expect(wrong.reply.payload.reason).toMatch(/does not match/i);

    const welcome = routeRemote({ pairing, tokens: [] }, remoteEnvelope("pair", { code: "482193" }), 1_001, () => "tok");
    expect(welcome.reply).toEqual(remoteEnvelope("welcome", { token: "tok" }));
    expect(welcome.session.tokens).toEqual(["tok"]);
    expect(welcome.command).toBeNull();

    const take = routeRemote(welcome.session, remoteEnvelope("command", { token: "tok", id: "take" }), 1_002);
    expect(take.command).toBe("take");
    expect(take.reply).toEqual(remoteEnvelope("ack", { id: "take" }));

    const next = routeRemote(welcome.session, remoteEnvelope("command", { token: "tok", id: "next" }), 1_003);
    expect(next.command).toBe("next");
    expect(isRemoteClicker("next")).toBe(true);
    expect(isRemoteClicker("previous")).toBe(true);
    expect(isRemoteClicker("take")).toBe(false);

    let live = previewLive();
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    const onAir = live.program;
    const following = presentText({ theme, layout: "title", heading: "Go in peace", body: "" });
    live = setPreview(live, frame(following, "slide-2", "cut"));
    expect(live.program).toEqual(onAir);
    live = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(live.program.model.lines[0]?.text).toBe("Go in peace");
    expect(programCue(live.program.model)).toBe("Go in peace");
    expect(programCue(blackModel(theme))).toBe("Black");
    expect(programPadPayload(live.program.model)).toMatchObject({ cue: "Go in peace", layout: "title", body: "Go in peace" });
  });
});
