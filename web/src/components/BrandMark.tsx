import { useState } from "react";

/**
 * The Aviva Paydesk lockup: the official Aviva wordmark followed by
 * "Paydesk" in the script face.
 *
 * The wordmark is the real asset from the brand manual, served from
 * `web/public/aviva-logo.svg`. It must be the version for LIGHT
 * backgrounds — every surface this renders on (login card, app bar, admin
 * header) is Blanco, not the dark green of the manual's examples.
 *
 * If that file is missing the component falls back to the word set in
 * Fustat Bold, which only approximates the real wordmark (it's a custom
 * typeface and can't be reproduced with a webfont). That fallback exists so
 * a deploy without the asset degrades instead of showing a broken image —
 * it is not the intended final state.
 */
export function BrandMark({ centered = false }: { centered?: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className={`brand-mark${centered ? " brand-mark--centered" : ""}`}>
      {logoFailed ? (
        <span className="brand-mark__aviva">Aviva</span>
      ) : (
        <img
          src="/aviva-logo.svg"
          alt="Aviva"
          className="brand-mark__logo"
          onError={() => setLogoFailed(true)}
        />
      )}
      <span className="brand-mark__product">Paydesk</span>
    </div>
  );
}
