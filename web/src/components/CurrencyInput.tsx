import { useState } from "react";

/** Digits and at most one decimal point, at most two decimals. Anything else the user types is dropped. */
function sanitize(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, "");
  const [entero, ...resto] = cleaned.split(".");
  if (resto.length === 0) return entero;
  return `${entero}.${resto.join("").slice(0, 2)}`;
}

/** Thousands separators on the integer part only, so the decimals the user is mid-typing aren't reformatted under them. */
function withSeparators(raw: string): string {
  if (!raw) return "";
  const [entero, decimales] = raw.split(".");
  const enteroConComas = entero ? Number(entero).toLocaleString("es-MX") : "";
  return decimales !== undefined ? `${enteroConComas}.${decimales}` : enteroConComas;
}

/**
 * Money field: shows a `$` and thousands separators as the store types, but
 * hands the parent a plain numeric string ("15000.5") since that's what
 * HubSpot's number properties take.
 *
 * A `<input type="number">` was the obvious choice and is what this
 * replaces — it renders spinner arrows, won't group thousands, and on
 * mobile some browsers accept `e`/`+`/`-`. A text input with
 * `inputMode="decimal"` still gets the numeric keypad without any of that.
 */
export function CurrencyInput({
  value,
  onChange,
  id,
  required,
  placeholder = "0.00",
}: {
  /** Raw numeric string, e.g. "15000.5". Empty string when blank. */
  value: string;
  onChange: (raw: string) => void;
  id?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => withSeparators(value));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = sanitize(e.target.value);
    setDisplay(withSeparators(raw));
    onChange(raw);
  }

  /** Settle on exactly two decimals once they're done typing, so the saved amount reads like money. */
  function handleBlur() {
    if (!value) {
      setDisplay("");
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setDisplay(n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    onChange(n.toFixed(2));
  }

  return (
    <div className="currency-input">
      <span className="currency-input__symbol" aria-hidden>
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
      />
      <span className="currency-input__currency" aria-hidden>
        MXN
      </span>
    </div>
  );
}
