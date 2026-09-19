/**
 * The morph from a lot-sweep row into the car's detail view.
 *
 * FLIP: measure **F**irst, let the DOM change to **L**ast, **I**nvert the difference
 * with a transform so the element still looks like it is where it was, then **P**lay it
 * back to identity. Only `transform` and `opacity` animate — both are composited, so no
 * frame does layout work. Animating `top`/`left`/`width` to the same effect would lay
 * out on every frame and fall off 60fps on a long sweep.
 *
 * Two deliberate choices about how it looks:
 *
 * - **The whole result panel travels, not just the heading.** An earlier version morphed
 *   only the `<h2>`, which moved about 30px while everything around it simply appeared.
 *   Technically a shared-element transition; in practice invisible. The eye follows the
 *   large moving object, so that has to be the thing that moves.
 * - **Uniform scale, not an exact rect match.** Matching the row's aspect ratio exactly
 *   means scaling a 66px-tall row into a 400px panel, which squashes every glyph inside
 *   it on the way. Scaling uniformly from 0.92 keeps the type undistorted and still
 *   reads as the row expanding.
 */

type Origin = { key: string; rect: DOMRect };

let pending: Origin | null = null;

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Called on the row being left behind, at the moment of the click. */
export function recordOrigin(key: string, el: HTMLElement | null) {
  if (!el || reduced()) return;
  pending = { key, rect: el.getBoundingClientRect() };
}

/**
 * Fades the list out under the incoming panel, so the two halves of the movement are
 * connected rather than one cutting to the other. Short on purpose — it should feel like
 * it is getting out of the way, not like a second animation.
 */
export function playExit(el: HTMLElement | null) {
  if (!el || reduced()) return;
  el.animate(
    [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: 'translate3d(0, -10px, 0) scale(0.985)', opacity: 0 },
    ],
    { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
}

/**
 * Called on the panel that has just arrived. Returns whether it animated, so the
 * behaviour is testable rather than a matter of opinion: `el.getAnimations()` will hold
 * the keyframes.
 */
export function playFrom(key: string, el: HTMLElement | null): boolean {
  if (!el || !pending || pending.key !== key || reduced()) return false;

  const last = el.getBoundingClientRect();

  // Bail BEFORE consuming the origin. Two elements can claim the same morph — the
  // placeholder header shown while the lookup is in flight, and the real panel that
  // replaces it — and with a warm cache the placeholder can be measured before layout,
  // giving a zero-size rect. Clearing `pending` here (as an earlier version did) meant
  // the placeholder swallowed the origin without animating and the real panel found
  // nothing. Whoever can actually animate gets it.
  if (!last.width || !last.height) return false;

  const first = pending.rect;

  // Align TOP edges, not centres. The row is ~66px tall and the result panel can be
  // 3,000px; matching centres put the start position 1,591px off-screen, which is a
  // flight rather than a transition. Matching tops means the panel appears to unfold
  // from where the row was, which is what actually happened.
  const dx = first.left - last.left;
  const dyRaw = first.top - last.top;

  // Cap the distance. Beyond roughly a third of the viewport the movement stops reading
  // as "this became that" and starts reading as "something slid in", and on a long page
  // the row can be arbitrarily far from where the panel lands.
  const cap = typeof window !== 'undefined' ? Math.min(320, window.innerHeight * 0.34) : 320;
  const dy = Math.max(-cap, Math.min(cap, dyRaw));

  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
    pending = null;
    return false;
  }

  pending = null;

  el.animate(
    [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.92)`, opacity: 0 },
      { transform: `translate3d(${dx * 0.12}px, ${dy * 0.12}px, 0) scale(0.985)`, opacity: 1, offset: 0.55 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
    ],
    {
      duration: 560,
      // Expo-out: most of the distance is covered early, then it settles. Reads as
      // deliberate rather than linear.
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    },
  );

  return true;
}

/** Clears a recorded origin that never got used — e.g. the lookup failed. */
export const clearOrigin = () => {
  pending = null;
};
