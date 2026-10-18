import { describe, expect, it } from "vitest";
import { PROGRAM_ACTIONS } from "../domain/types";
import { changesProgram, IN_PLACE_COMMANDS, programCommandIds, programCommandsMatchActions, TIMER_COMMANDS } from "./registry";

describe("commands", () => {
  it("lets only take, cut, clear, black, logo, clear words and timer controls change program", () => {
    expect(programCommandsMatchActions()).toBe(true);
    expect(programCommandIds()).toEqual([...PROGRAM_ACTIONS, ...IN_PLACE_COMMANDS, ...TIMER_COMMANDS]);
    expect(changesProgram("next")).toBe(false);
    expect(changesProgram("focus")).toBe(false);
    expect(changesProgram("library")).toBe(false);
    expect(changesProgram("queue")).toBe(false);
    expect(changesProgram("find")).toBe(false);
    expect(changesProgram("take")).toBe(true);
  });
});
