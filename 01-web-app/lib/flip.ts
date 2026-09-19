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
 * - **It unfolds, it does not slide.** A translate-and-fade is the most generic motion
 *   on the web and reads as "the page changed", not "that row became this". The panel
 *   instead grows vertically out of the row's band, anchored at the top edge.
 * - **The content is counter-scaled.** Scaling a container squashes every glyph inside
 *   it, which looks broken. The inner wrapper runs the inverse scale on the same curve,
 *   so the box expands while the type inside stays the right shape the whole way. That
 *   correction is the part worth knowing about - it is what separates this from a CSS
 *   height transition.
 */

type Origin = { key: string; rect: DOMRect };

let pending: Origin | null = null;

/**
 * `?motion=slow` multiplies every duration by four.
 *
 * Added because "I can't tell there's an animation" is not a bug report anyone can act
 * on, and neither is "looks fine to me". At 4x the movement is unmistakable, which
 * makes it possible to agree on what it actually does before arguing about timing. It
 * is also how the walkthrough video shows the morph without slowing the recording.
 */
const speed = () => {
  if (typeof window === 'undefined') return 1;
  return new URLSearchParams(window.location.search).get('motion') === 'slow' ? 4 : 1;
};

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
    { duration: 220 * speed(), easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
}

/**
 * Called on the panel that has just arrived. Returns whether it animated, so the
 * behaviour is testable rather than a matter of opinion: `el.getAnimations()` will hold
 * the keyframes.
 */
export function playFrom(
  key: string,
  el: HTMLElement | null,
  inner?: HTMLElement | null,
): boolean {
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

  // How thin the panel starts. The true ratio of a 66px row to a 3,000px panel is about
  // 0.02, which is a hairline and reads as a glitch rather than an unfold, so it is
  // clamped to something legible.
  const k = Math.max(0.28, Math.min(0.85, first.height / last.height));

  const duration = 620 * speed();
  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

  el.animate(
    [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scaleY(${k})`, opacity: 0.15 },
      { transform: `translate3d(${dx * 0.1}px, ${dy * 0.1}px, 0) scaleY(${1 + (1 - k) * 0.03})`, opacity: 1, offset: 0.62 },
      { transform: 'translate3d(0, 0, 0) scaleY(1)', opacity: 1 },
    ],
    { duration, easing, fill: 'both' },
  );

  // The inverse, on the same curve and duration, so the two cancel frame for frame.
  // Without this the whole panel's text is squashed flat at the start and stretches
  // back out, which looks like a rendering fault rather than a transition.
  inner?.animate(
    [
      { transform: `scaleY(${1 / k})` },
      { transform: `scaleY(${1 / (1 + (1 - k) * 0.03)})`, offset: 0.62 },
      { transform: 'scaleY(1)' },
    ],
    { duration, easing, fill: 'both' },
  );

  return true;
}

/** Clears a recorded origin that never got used — e.g. the lookup failed. */
export const clearOrigin = () => {
  pending = null;
};
