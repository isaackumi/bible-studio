/** 20-second microphone test: long enough to catch a mic that cuts out shortly after it starts. */
export const MIC_TEST_MS = 20_000;
export const MIC_SAMPLE_MS = 100;
/** Level (0–1) that counts as hearing something. */
export const MIC_SIGNAL_LEVEL = 0.02;
/** Below this the input is digitally silent (a dropped or muted device), not a quiet room. */
const DIGITAL_SILENCE = 0.001;
const CUT_OUT_MS = 3_000;

export type MicVerdict = { status: "ok" | "quiet" | "cut-out"; message: string };

/** Judge a finished (or interrupted) test from level samples taken every MIC_SAMPLE_MS. */
export function micVerdict(levels: number[], ended: boolean): MicVerdict {
  const heard = levels.findIndex((level) => level >= MIC_SIGNAL_LEVEL);
  if (ended) {
    return { status: "cut-out", message: "The microphone stopped during the test. Check the cable, Bluetooth, or that another app has not taken it." };
  }
  if (heard < 0) {
    return { status: "quiet", message: "No sound reached Church Studio. Speak or play audio near the microphone, check its mute switch, or pick it as the system input." };
  }
  let silent = 0;
  for (const level of levels.slice(heard)) {
    silent = level < DIGITAL_SILENCE ? silent + MIC_SAMPLE_MS : 0;
    if (silent >= CUT_OUT_MS) {
      return { status: "cut-out", message: "The microphone went completely silent after working. It may be dropping out; try another cable or input." };
    }
  }
  return { status: "ok", message: "The microphone is working and stayed connected for the whole test." };
}
