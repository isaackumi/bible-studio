import type { DisplayAssignment, DisplayInfo, DisplayProfile, OutputMode, OutputRole } from "../domain/types";

export function factoryProfiles(): DisplayProfile[] {
  return [
    {
      id: "profile-this-computer",
      name: "This computer",
      builtin: true,
      assignments: { operator: null, audience: null, stage: null },
      outputEnabled: false,
      outputMode: "window",
    },
  ];
}

export function outputMode(value: unknown): OutputMode {
  return value === "fullscreen" ? "fullscreen" : "window";
}

export function setAssignment(profile: DisplayProfile, role: OutputRole, displayKey: string | null): DisplayProfile {
  return { ...profile, assignments: { ...profile.assignments, [role]: displayKey || null } };
}

export function duplicateProfile(profile: DisplayProfile, id: string, name: string): DisplayProfile {
  return {
    ...structuredClone(profile),
    id,
    name: name.trim() || `${profile.name} copy`,
    builtin: false,
  };
}

export function renameProfile(profile: DisplayProfile, name: string): DisplayProfile {
  const trimmed = name.trim();
  if (!trimmed) return profile;
  return { ...profile, name: trimmed };
}

export function deleteProfile(profiles: DisplayProfile[], id: string): DisplayProfile[] | null {
  const target = profiles.find((profile) => profile.id === id);
  if (!target || target.builtin || profiles.length < 2) return null;
  return profiles.filter((profile) => profile.id !== id);
}

export type AudienceResolution = {
  mode: "auto" | "assigned";
  display: DisplayInfo | null;
  missing: boolean;
};

/** Null audience assignment means the first non-primary display. A missing assigned display stays offline. */
export function resolveAudience(assignment: string | null, displays: DisplayInfo[]): AudienceResolution {
  if (!assignment) {
    const external = displays.find((display) => !display.primary) ?? null;
    return { mode: "auto", display: external, missing: external === null };
  }
  const display = displays.find((item) => item.key === assignment) ?? null;
  return { mode: "assigned", display, missing: display === null };
}

export function sameScreen(assignments: DisplayAssignment): boolean {
  return Boolean(assignments.operator && assignments.audience && assignments.operator === assignments.audience);
}

export function normalizeProfile(input: unknown): DisplayProfile | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<DisplayProfile>;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  const assignments = value.assignments ?? { operator: null, audience: null, stage: null };
  const key = (role: OutputRole) => {
    const stored = assignments[role];
    return typeof stored === "string" && stored.trim() ? stored : null;
  };
  return {
    id: value.id,
    name: value.name.trim(),
    builtin: Boolean(value.builtin),
    assignments: { operator: key("operator"), audience: key("audience"), stage: key("stage") },
    outputEnabled: value.outputEnabled === true,
    outputMode: outputMode(value.outputMode),
  };
}
