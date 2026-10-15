import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, setPreview } from "./live";
import { presentText } from "./present";
import {
  authorizeRemoteCommand,
  createPairing,
  pairRemote,
  REMOTE_COMMANDS,
  remoteEnvelope,
} from "./remote";
import { defaultTheme } from "./theme";

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
