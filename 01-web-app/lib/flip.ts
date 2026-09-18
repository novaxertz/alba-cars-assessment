/**
 * A small FLIP implementation for the sweep-row → detail morph.
 *
 * FLIP: measure **F**irst, let the DOM change to **L**ast, **I**nvert the difference
 * with a transform so the element still appears to be where it was, then **P**lay it
 * back to identity. The browser animates only `transform` and `opacity`, both of which
 * the compositor handles, so no frame does layout work. Animating `top`/`left`/`width`
 * to the same effect would lay out on every frame and drop below 60fps on a long list.
 *
 * Written by hand on purpose. React's `<ViewTransition>` is the tidier answer and I
 * tried it first, but it never called `document.startViewTransition` in this setup —
 * verified by hooking the method and counting, not by watching for a flicker. Rather
 * than ship an animation I could not prove was running, this is explicit: the rects are
 * measured, the animation is created, and `element.getAnimations()` can confirm it.
 */

type Origin = { key: string; rect: DOMRect };

let pending: Origin | null = null;

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Called on the element being left behind, at the moment of the click. */
export function recordOrigin(key: string, el: HTMLElement | null) {
  if (!el || reduced()) return;
  pending = { key, rect: el.getBoundingClientRect() };
}

/**
 * Called on the element that has just arrived. Returns true if it animated, which makes
 * the behaviour testable rather than a matter of opinion.
 */
export function playFrom(key: string, el: HTMLElement | null): boolean {
  if (!el || !pending || pending.key !== key || reduced()) return false;

  const last = el.getBoundingClientRect();

  // Bail BEFORE consuming the origin. Two elements can claim the same morph - the
  // placeholder header that renders while the lookup is in flight, and the real one
  // that replaces it - and with a warm cache the placeholder can be measured before it
  // has been laid out, giving a zero-size rect. Clearing `pending` here (as an earlier
  // version did) meant the placeholder swallowed the origin without animating, and the
  // real header then found nothing. Whoever can actually animate gets it.
  if (!last.width || !last.height) return false;

  const first = pending.rect;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const scaleX = Math.min(2.5, Math.max(0.4, first.width / last.width));

  // Already in place: animating nothing is worse than not animating. This one does
  // consume the origin - the morph is over, it just had nowhere to travel.
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(scaleX - 1) < 0.02) {
    pending = null;
    return false;
  }

  pending = null;

  el.animate(
    [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, 1)`, opacity: 0.55 },
      { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' },
  );

  return true;
}

/** Clears a recorded origin that never got used — e.g. the fetch failed. */
export const clearOrigin = () => {
  pending = null;
};
