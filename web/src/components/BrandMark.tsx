/**
 * The Aviva Pay Desk lockup: the Aviva logo followed by "Pay Desk" in the
 * script face.
 *
 * TODO — the "Aviva" half is NOT the real logo yet. It's the word set in
 * Fustat Bold, which only approximates it: the real wordmark is a custom
 * typeface (see the brand manual) and can't be reproduced with a webfont.
 * To fix, drop the official SVG at `web/public/aviva-logo.svg` and swap the
 * <span> below for:
 *
 *   <img src="/aviva-logo.svg" alt="Aviva" className="brand-mark__logo" />
 *
 * Use the version meant for light backgrounds — the app's surfaces are
 * Blanco and Gris Frío, not the dark green of the manual's examples.
 */
export function BrandMark({ centered = false }: { centered?: boolean }) {
  return (
    <div className={`brand-mark${centered ? " brand-mark--centered" : ""}`}>
      <span className="brand-mark__aviva">Aviva</span>
      <span className="brand-mark__product">Pay Desk</span>
    </div>
  );
}
