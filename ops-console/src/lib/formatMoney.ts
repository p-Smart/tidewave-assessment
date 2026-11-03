// Minor-unit exponent per currency. XOF has no smaller unit (PR3): 6500 minor = 6,500 XOF (OPS-003).
const MINOR_UNIT_DIGITS: Record<string, number> = { NGN: 2, USD: 2, GHS: 2, XOF: 0 };

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = MINOR_UNIT_DIGITS[currency.toUpperCase()] ?? 2;
  const amount = (amountMinor / 10 ** digits).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${amount} ${currency}`;
}
