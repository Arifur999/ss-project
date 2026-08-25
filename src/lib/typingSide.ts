/**
 * Whose typing bubble to draw, and on which side.
 *
 * The server publishes a keystroke to everyone entitled to see the ticket -
 * which includes the person who made it. Taken at face value that lit a bubble
 * on your own screen while you were the one typing, labelled as the other
 * side, and always on the left. So the event has to be read for *who* typed,
 * not merely that somebody did.
 */

export type TypingSide = 'admin' | 'customer'

export type TypingMark = { at: number; from: TypingSide }

/**
 * The side to draw a bubble for, or null for none.
 *
 * Null when the mark has gone stale, and null when the mark is your own -
 * nobody needs telling that they are typing.
 */
export function bubbleFor(
  mark: TypingMark | undefined,
  viewerIsAdmin: boolean,
  clearAfterMs: number,
  now: number = Date.now(),
): TypingSide | null {
  if (!mark) return null
  if (now - mark.at >= clearAfterMs) return null
  const mine = (mark.from === 'admin') === viewerIsAdmin
  return mine ? null : mark.from
}

/** Which side of the thread that bubble belongs on: the writer's own side. */
export const bubbleIsMine = (side: TypingSide, viewerIsAdmin: boolean): boolean =>
  (side === 'admin') === viewerIsAdmin
