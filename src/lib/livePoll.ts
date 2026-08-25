/**
 * How often a conversation asks the server whether anything changed.
 *
 * Support has no socket, so it polls. Two things pull in opposite directions:
 * a reply should appear without anyone reaching for Refresh, and a typing
 * bubble is useless if it arrives after the message it was meant to precede -
 * both want a short interval. Against that, a tab left open all afternoon
 * should not spend the afternoon asking.
 *
 * So: poll briskly while somebody is actually looking, and not at all when
 * they are not. A hidden tab has nobody to show a bubble to, and whatever
 * arrived while it was hidden is fetched the moment it comes back.
 */
export const LIVE_POLL_MS = 4000

/** How long after the last keystroke the client stops saying "still typing". */
export const TYPING_HEARTBEAT_MS = 2500

/**
 * Whether this tab should be polling at all.
 *
 * Exported rather than inlined so the rule is stated once and can be tested
 * without a browser: no polling while the document is hidden.
 */
export const shouldPoll = (visibility: DocumentVisibilityState): boolean =>
  visibility === 'visible'

/**
 * Whether enough time has passed to send another typing heartbeat.
 *
 * A request per keystroke would be dozens a sentence; one every couple of
 * seconds keeps the other side's bubble alive just as well, because the
 * server holds it for longer than this gap.
 */
export const shouldSendHeartbeat = (lastSentAt: number, now: number): boolean =>
  now - lastSentAt >= TYPING_HEARTBEAT_MS
