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

export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
// The smallest thing that is still a PNG. Anything shorter cannot decode.
const MIN_PNG_BYTES = 67;

/**
 * Whether a stored signature is one a document can actually draw.
 *
 * The submit endpoint only ever checked that the string was non-empty, so a
 * truncated data URL went in, sat on a perfectly normal looking count, and then
 * threw inside pdf-lib the day somebody asked for the form - a 500 on the one
 * document that goes to the state, and a cryptic "Invalid typed array length"
 * on the approval email. The bytes are cheap to check on the way in, and that is
 * the only moment when refusing costs nobody anything.
 *
 * An EMPTY signature stays legal: every count imported from the spreadsheets has
 * one, and their forms render fine with a blank signature line.
 */
export function isRenderableSignature(value) {
  if (typeof value !== 'string' || !value.startsWith(PNG_DATA_URL_PREFIX)) return false;
  const body = value.slice(PNG_DATA_URL_PREFIX.length);
  let bytes;
  try {
    bytes =
      typeof Buffer !== 'undefined'
        ? Buffer.from(body, 'base64')
        : Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  } catch {
    return false;
  }
  if (bytes.length < MIN_PNG_BYTES) return false;
  return PNG_MAGIC.every((byte, index) => bytes[index] === byte);
}
