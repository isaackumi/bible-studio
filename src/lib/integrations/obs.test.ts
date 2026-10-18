import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { idleSwitcher, ObsSwitcher, sanitizeSwitcher, type SwitcherState } from "./switcher";

// A small stand-in for OBS: the obs-websocket 5 handshake (with a password), a scene list, and
// the requests the desk sends. Enough WebSocket framing for short text messages.
const b64sha = (text: string) => createHash("sha256").update(text).digest("base64");

function frame(text: string): Buffer {
  const body = Buffer.from(text);
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([head, body]);
}

function readFrames(buffer: Buffer): string[] {
  const out: string[] = [];
  let at = 0;
  while (at + 2 <= buffer.length) {
    let length = buffer[at + 1]! & 0x7f;
    let offset = at + 2;
    if (length === 126) {
      length = buffer.readUInt16BE(offset);
      offset += 2;
    }
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const data = Buffer.from(buffer.subarray(offset, offset + length).map((byte, i) => byte ^ mask[i % 4]!));
    if ((buffer[at]! & 0x0f) === 1) out.push(data.toString());
    at = offset + length;
  }
  return out;
}

function fakeObs(password: string): Promise<{ server: Server; port: number; seen: string[] }> {
  const seen: string[] = [];
  const salt = "c2FsdA==";
  const challenge = "Y2hhbGxlbmdl";
  let program = "Worship";
  const server = createServer();
  server.on("upgrade", (request, socket: Socket) => {
    const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const send = (message: unknown) => socket.write(frame(JSON.stringify(message)));
    send({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1, authentication: { challenge, salt } } });
    socket.on("data", (chunk: Buffer) => {
      for (const text of readFrames(chunk)) {
        const message = JSON.parse(text);
        if (message.op === 1) {
          if (message.d.authentication !== b64sha(b64sha(password + salt) + challenge)) {
            socket.write(Buffer.from([0x88, 2, 0x0f, 0xa9])); // close 4009: authentication failed
            socket.end();
            return;
          }
          send({ op: 2, d: { negotiatedRpcVersion: 1 } });
        } else if (message.op === 6) {
          const { requestType, requestId, requestData } = message.d;
          seen.push(requestType + (requestData?.sceneName ? `:${requestData.sceneName}` : ""));
          let responseData: Record<string, unknown> = {};
          if (requestType === "GetSceneList") responseData = { currentProgramSceneName: program, currentPreviewSceneName: null, scenes: [{ sceneName: "Sermon" }, { sceneName: "Worship" }, { sceneName: "Walk-in" }] };
          if (requestType === "GetStreamStatus" || requestType === "GetRecordStatus") responseData = { outputActive: false };
          if (requestType === "SetCurrentProgramScene") {
            program = requestData.sceneName;
            send({ op: 5, d: { eventType: "CurrentProgramSceneChanged", eventData: { sceneName: program } } });
          }
          if (requestType === "StartStream") send({ op: 5, d: { eventType: "StreamStateChanged", eventData: { outputActive: true } } });
          send({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } });
        }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port, seen })));
}

let running: Server | null = null;
afterEach(() => {
  running?.close();
  running = null;
});

describe("OBS control", () => {
  it("connects with the password, lists scenes, switches and starts the stream", async () => {
    const obs = await fakeObs("hunter2");
    running = obs.server;
    let state: SwitcherState = idleSwitcher();
    const client = new ObsSwitcher(sanitizeSwitcher({ kind: "obs", host: "127.0.0.1", port: obs.port, password: "hunter2" }), (patch) => (state = { ...state, ...patch }));
    await client.connect();
    expect(state.status).toBe("on");
    expect(state.scenes).toEqual(["Walk-in", "Worship", "Sermon"]);
    expect(state.program).toBe("Worship");
    await client.setProgram("Sermon");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.program).toBe("Sermon");
    await client.setStreaming(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.streaming).toBe(true);
    expect(obs.seen).toContain("SetCurrentProgramScene:Sermon");
    client.close();
  });

  it("says so when the password is wrong", async () => {
    const obs = await fakeObs("right");
    running = obs.server;
    let state: SwitcherState = idleSwitcher();
    const client = new ObsSwitcher(sanitizeSwitcher({ kind: "obs", host: "127.0.0.1", port: obs.port, password: "wrong" }), (patch) => (state = { ...state, ...patch }));
    await expect(client.connect()).rejects.toThrow(/password/);
    expect(state.status).toBe("error");
  });
});
