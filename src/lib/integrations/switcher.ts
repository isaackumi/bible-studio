// Live production apps the desk can drive: OBS (obs-websocket 5, built into OBS 28+) and vMix
// (its Web API). Both look the same to the app: scenes (OBS) or inputs (vMix) to put on air, and
// streaming and recording to start and stop. NDI carries the pictures; this carries the buttons.

export type SwitcherKind = "none" | "obs" | "vmix";

export type SwitcherSettings = { kind: SwitcherKind; host: string; port: number; password: string; autoConnect: boolean };

export type SwitcherState = {
  status: "off" | "connecting" | "on" | "error";
  message: string;
  /** Scene names (OBS) or input titles (vMix), in the app's order. */
  scenes: string[];
  program: string | null;
  preview: string | null;
  streaming: boolean;
  recording: boolean;
};

export const SWITCHER_PORTS: Record<Exclude<SwitcherKind, "none">, number> = { obs: 4455, vmix: 8088 };

export function defaultSwitcher(): SwitcherSettings {
  return { kind: "none", host: "127.0.0.1", port: SWITCHER_PORTS.obs, password: "", autoConnect: true };
}

export function sanitizeSwitcher(value: unknown): SwitcherSettings {
  const base = defaultSwitcher();
  const record = value && typeof value === "object" ? (value as Partial<SwitcherSettings>) : {};
  const kind: SwitcherKind = record.kind === "obs" || record.kind === "vmix" ? record.kind : "none";
  const host = typeof record.host === "string" && record.host.trim() ? record.host.trim().slice(0, 120) : base.host;
  const port = typeof record.port === "number" && Number.isInteger(record.port) && record.port > 0 && record.port < 65536 ? record.port : kind === "none" ? base.port : SWITCHER_PORTS[kind];
  return { kind, host, port, password: typeof record.password === "string" ? record.password.slice(0, 200) : "", autoConnect: record.autoConnect !== false };
}

export function idleSwitcher(message = ""): SwitcherState {
  return { status: "off", message, scenes: [], program: null, preview: null, streaming: false, recording: false };
}

export interface Switcher {
  connect(): Promise<void>;
  close(): void;
  /** Put a scene (OBS) or input (vMix) on air. */
  setProgram(name: string): Promise<void>;
  setStreaming(on: boolean): Promise<void>;
  setRecording(on: boolean): Promise<void>;
}

// MARK: OBS

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** obs-websocket 5's answer to its challenge: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export async function obsAuth(password: string, salt: string, challenge: string): Promise<string> {
  return sha256Base64((await sha256Base64(password + salt)) + challenge);
}

type ObsMessage = { op: number; d: Record<string, unknown> };

export class ObsSwitcher implements Switcher {
  private socket: WebSocket | null = null;
  private waiting = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  private counter = 0;

  constructor(
    private settings: SwitcherSettings,
    private onState: (patch: Partial<SwitcherState>) => void,
  ) {}

  connect(): Promise<void> {
    this.close();
    this.onState({ status: "connecting", message: "" });
    return new Promise((resolve, reject) => {
      let ready = false;
      const socket = new WebSocket(`ws://${this.settings.host}:${this.settings.port}`);
      this.socket = socket;
      const failed = (message: string) => {
        if (!ready) reject(new Error(message));
        this.onState({ ...idleSwitcher(message), status: "error" });
      };
      socket.onerror = () => failed(`OBS did not answer at ${this.settings.host}:${this.settings.port}. In OBS: Tools › WebSocket Server Settings › Enable.`);
      socket.onclose = (event) => {
        if (event.code === 4009) failed("OBS refused the password. Copy it from OBS: Tools › WebSocket Server Settings › Show Connect Info.");
        else if (ready) this.onState({ ...idleSwitcher("OBS closed the connection."), status: "error" });
        else failed(`OBS did not answer at ${this.settings.host}:${this.settings.port}.`);
        this.socket = null;
      };
      socket.onmessage = async (event) => {
        let message: ObsMessage;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.op === 0) {
          const auth = message.d.authentication as { challenge: string; salt: string } | undefined;
          const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 1 | 4 | 64 };
          if (auth) identify.authentication = await obsAuth(this.settings.password, auth.salt, auth.challenge);
          socket.send(JSON.stringify({ op: 1, d: identify }));
        } else if (message.op === 2) {
          ready = true;
          await this.refresh().catch(() => {});
          this.onState({ status: "on", message: "" });
          resolve();
        } else if (message.op === 5) {
          this.onEvent(String(message.d.eventType), (message.d.eventData ?? {}) as Record<string, unknown>);
        } else if (message.op === 7) {
          const id = String(message.d.requestId);
          const pending = this.waiting.get(id);
          if (!pending) return;
          this.waiting.delete(id);
          const status = message.d.requestStatus as { result: boolean; comment?: string };
          if (status?.result) pending.resolve((message.d.responseData ?? {}) as Record<string, unknown>);
          else pending.reject(new Error(status?.comment ?? "OBS could not do that."));
        }
      };
    });
  }

  private request(requestType: string, requestData: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("OBS is not connected."));
    const requestId = `cs-${++this.counter}`;
    return new Promise((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.waiting.delete(requestId)) reject(new Error("OBS did not answer in time."));
      }, 5000);
    });
  }

  private async refresh() {
    const list = await this.request("GetSceneList");
    const scenes = ((list.scenes as Array<{ sceneName: string }>) ?? []).map((scene) => scene.sceneName).reverse();
    const [stream, record] = await Promise.all([this.request("GetStreamStatus").catch(() => ({})), this.request("GetRecordStatus").catch(() => ({}))]);
    this.onState({
      scenes,
      program: (list.currentProgramSceneName as string) ?? null,
      preview: (list.currentPreviewSceneName as string) ?? null,
      streaming: (stream as { outputActive?: boolean }).outputActive === true,
      recording: (record as { outputActive?: boolean }).outputActive === true,
    });
  }

  private onEvent(type: string, data: Record<string, unknown>) {
    if (type === "CurrentProgramSceneChanged") this.onState({ program: String(data.sceneName) });
    else if (type === "CurrentPreviewSceneChanged") this.onState({ preview: String(data.sceneName) });
    else if (type === "SceneListChanged" || type === "SceneNameChanged" || type === "SceneCreated" || type === "SceneRemoved") void this.refresh().catch(() => {});
    else if (type === "StreamStateChanged") this.onState({ streaming: data.outputActive === true });
    else if (type === "RecordStateChanged") this.onState({ recording: data.outputActive === true });
  }

  async setProgram(name: string) {
    await this.request("SetCurrentProgramScene", { sceneName: name });
  }

  async setStreaming(on: boolean) {
    await this.request(on ? "StartStream" : "StopStream");
  }

  async setRecording(on: boolean) {
    await this.request(on ? "StartRecord" : "StopRecord");
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    for (const pending of this.waiting.values()) pending.reject(new Error("Disconnected."));
    this.waiting.clear();
  }
}

// MARK: vMix

export type VmixState = { inputs: Array<{ number: number; title: string }>; active: number | null; preview: number | null; streaming: boolean; recording: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (text: string) => text.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (whole, name: string) => (name.startsWith("#") ? String.fromCharCode(Number(name.slice(1))) : (ENTITIES[name] ?? whole)));

/** vMix's /api XML: its inputs, what is active and on preview, and whether it streams or records. */
export function parseVmix(xml: string): VmixState {
  if (!/<vmix>/i.test(xml)) throw new Error("vMix sent something unreadable.");
  const inputsBlock = xml.match(/<inputs>([\s\S]*?)<\/inputs>/i)?.[1] ?? "";
  const inputs = [...inputsBlock.matchAll(/<input\b([^>]*?)\/?>/gi)].map((match) => {
    const attr = (name: string) => match[1]!.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";
    return { number: Number(attr("number")), title: unescape(attr("title")) };
  }).filter((input) => input.number > 0);
  const number = (tag: string) => {
    const value = Number(xml.match(new RegExp(`<${tag}>(\\d+)</${tag}>`, "i"))?.[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const flag = (tag: string) => xml.match(new RegExp(`<${tag}>\\s*(\\w+)\\s*</${tag}>`, "i"))?.[1]?.toLowerCase() === "true";
  return { inputs, active: number("active"), preview: number("preview"), streaming: flag("streaming"), recording: flag("recording") };
}

/** vMix titles can repeat; the desk shows "3 · Camera" so each is its own button. */
export function vmixName(input: { number: number; title: string }): string {
  return `${input.number} · ${input.title}`;
}

export class VmixSwitcher implements Switcher {
  private poll: ReturnType<typeof setInterval> | null = null;
  private inputs: VmixState["inputs"] = [];

  constructor(
    private settings: SwitcherSettings,
    private onState: (patch: Partial<SwitcherState>) => void,
    private get: (host: string, port: number, query: string) => Promise<string>,
  ) {}

  private async read() {
    const state = parseVmix(await this.get(this.settings.host, this.settings.port, ""));
    this.inputs = state.inputs;
    const name = (number: number | null) => {
      const input = state.inputs.find((entry) => entry.number === number);
      return input ? vmixName(input) : null;
    };
    this.onState({ status: "on", message: "", scenes: state.inputs.map(vmixName), program: name(state.active), preview: name(state.preview), streaming: state.streaming, recording: state.recording });
  }

  async connect() {
    this.close();
    this.onState({ status: "connecting", message: "" });
    try {
      await this.read();
    } catch (error) {
      const message = `vMix did not answer at ${this.settings.host}:${this.settings.port}. In vMix: Settings › Web Controller › Enable. ${error instanceof Error ? error.message : ""}`.trim();
      this.onState({ ...idleSwitcher(message), status: "error" });
      throw new Error(message);
    }
    this.poll = setInterval(() => {
      void this.read().catch(() => this.onState({ status: "error", message: "vMix stopped answering." }));
    }, 1000);
  }

  private async call(query: string) {
    await this.get(this.settings.host, this.settings.port, query);
    await this.read().catch(() => {});
  }

  async setProgram(name: string) {
    const input = this.inputs.find((entry) => vmixName(entry) === name);
    if (!input) throw new Error("That vMix input is gone.");
    await this.call(`Function=CutDirect&Input=${input.number}`);
  }

  async setStreaming(on: boolean) {
    await this.call(`Function=${on ? "StartStreaming" : "StopStreaming"}`);
  }

  async setRecording(on: boolean) {
    await this.call(`Function=${on ? "StartRecording" : "StopRecording"}`);
  }

  close() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }
}
