import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { idleSwitcher, obsAuth, parseVmix, sanitizeSwitcher, vmixName, VmixSwitcher, type SwitcherState } from "./switcher";

const b64sha = (text: string) => createHash("sha256").update(text).digest("base64");

describe("production app control", () => {
  it("answers the obs-websocket challenge the way OBS checks it", async () => {
    const expected = b64sha(b64sha("supersecret" + "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=") + "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=");
    expect(await obsAuth("supersecret", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=")).toBe(expected);
  });

  it("reads vMix's state", () => {
    const xml = `<vmix><version>27.0.0.49</version><inputs><input key="a" number="1" type="Capture" title="Camera &amp; Pulpit" state="Running">Camera &amp; Pulpit</input><input key="b" number="2" type="NDISource" title="Church Studio Program">x</input></inputs><overlays></overlays><preview>2</preview><active>1</active><streaming>True</streaming><recording>False</recording></vmix>`;
    const state = parseVmix(xml);
    expect(state.inputs).toEqual([{ number: 1, title: "Camera & Pulpit" }, { number: 2, title: "Church Studio Program" }]);
    expect(state.active).toBe(1);
    expect(state.preview).toBe(2);
    expect(state.streaming).toBe(true);
    expect(state.recording).toBe(false);
    expect(vmixName(state.inputs[0]!)).toBe("1 · Camera & Pulpit");
    expect(() => parseVmix("<html></html>")).toThrow();
  });

  it("cleans saved settings, with each app's usual port", () => {
    expect(sanitizeSwitcher({ kind: "vmix" })).toMatchObject({ kind: "vmix", port: 8088, host: "127.0.0.1" });
    expect(sanitizeSwitcher({ kind: "obs", port: 99999 })).toMatchObject({ kind: "obs", port: 4455 });
    expect(sanitizeSwitcher(null).kind).toBe("none");
  });

  it("drives vMix through its Web API", async () => {
    let active = 1;
    let streaming = false;
    const calls: string[] = [];
    const get = async (_host: string, _port: number, query: string) => {
      calls.push(query);
      if (query === "Function=CutDirect&Input=2") active = 2;
      if (query === "Function=StartStreaming") streaming = true;
      return `<vmix><inputs><input number="1" title="Camera"/><input number="2" title="Church Studio Program"/></inputs><active>${active}</active><preview>1</preview><streaming>${streaming ? "True" : "False"}</streaming><recording>False</recording></vmix>`;
    };
    let state: SwitcherState = idleSwitcher();
    const client = new VmixSwitcher(sanitizeSwitcher({ kind: "vmix" }), (patch) => (state = { ...state, ...patch }), get);
    await client.connect();
    expect(state.scenes).toEqual(["1 · Camera", "2 · Church Studio Program"]);
    expect(state.program).toBe("1 · Camera");
    await client.setProgram("2 · Church Studio Program");
    expect(state.program).toBe("2 · Church Studio Program");
    await client.setStreaming(true);
    expect(state.streaming).toBe(true);
    expect(calls).toContain("Function=CutDirect&Input=2");
    client.close();
  });
});
