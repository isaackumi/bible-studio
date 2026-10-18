import { bindLanguage, type UiLanguage } from "./core";

// The chosen language as Svelte state: t() reads it, so the whole desk switches at once.
export const uiLanguage = $state<{ current: UiLanguage }>({ current: "en" });

bindLanguage(() => uiLanguage.current);

export { t, tn, UI_LANGUAGES, type UiLanguage } from "./core";
