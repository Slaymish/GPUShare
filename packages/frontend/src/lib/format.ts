/**
 * Format a dollar amount, using 4 decimals when |value| < 0.01,
 * and converting -0.00 to 0.00.
 */
export function fmtUsd(value: number, minDecimals = 2): string {
  const abs = Math.abs(value);
  const decimals = abs > 0 && abs < 0.01 ? 4 : minDecimals;
  const formatted = abs.toFixed(decimals);
  if (value < 0 && parseFloat(formatted) > 0) {
    return `-$${formatted}`;
  }
  return `$${formatted}`;
}
