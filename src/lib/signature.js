// A tap leaves a dot, and a dot is not a signature: ink only counts once the
// stroke has real length, which is what the paper form means by signing.
//
// This rule started life inside the daily meal count's signature field and was
// never carried to the public claim-signing page - so the document with the most
// legal weight in the app was the one that accepted a single dot. It lives here
// now precisely so there is one rule and both places read it.
export const MIN_STROKE_LENGTH = 30;

/** Total drawn length, in px, across every stroke on a react-signature-canvas pad. */
export function strokeLength(pad) {
  const strokes = pad?.toData?.() ?? [];
  return strokes.reduce((total, stroke) => {
    let sum = 0;
    for (let i = 1; i < stroke.length; i++) {
      sum += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
    return total + sum;
  }, 0);
}

/** Whether what is on the pad is a signature rather than a tap. */
export function isSigned(pad) {
  if (!pad || pad.isEmpty?.()) return false;
  return strokeLength(pad) >= MIN_STROKE_LENGTH;
}
