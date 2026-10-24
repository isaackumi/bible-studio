// What the desk says about cloud sync, kept out of the desk's own bundle (loaded with the engine).

import { t, tn } from "../i18n/core";

/** A fresh computer just received the licence's library. */
export function restoredNotice(records: number): { title: string; detail: string } {
  return {
    title: t("Your library is back from the cloud"),
    detail: tn(records, "{n} song, service or sermon came down from your cloud copy. Pictures and videos follow in the background.", "{n} songs, services and sermons came down from your cloud copy. Pictures and videos follow in the background."),
  };
}
