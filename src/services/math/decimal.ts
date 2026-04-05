import Decimal from "decimal.js";

type DecimalLike = Decimal.Value | null | undefined;

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP
});

const ZERO = new Decimal(0);

function parseDecimal(value: Decimal.Value): Decimal {
  try {
    return new Decimal(value);
  } catch {
    return ZERO;
  }
}

export function dec(value: DecimalLike): Decimal {
  if (value === null || value === undefined) {
    return ZERO;
  }

  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? parseDecimal(value) : ZERO;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? parseDecimal(normalized) : ZERO;
  }

  return parseDecimal(value);
}

export function decUnknown(value: unknown): Decimal {
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint" || value instanceof Decimal) {
    return dec(value);
  }

  return ZERO;
}

export function sumDecimals(values: Iterable<DecimalLike>): Decimal {
  let sum = ZERO;
  for (const value of values) {
    sum = sum.plus(dec(value));
  }
  return sum;
}

export function safeDiv(numerator: DecimalLike, denominator: DecimalLike): Decimal {
  const den = dec(denominator);
  if (den.lte(0)) {
    return ZERO;
  }
  return dec(numerator).div(den);
}

export function safePct(numerator: DecimalLike, denominator: DecimalLike): Decimal {
  return safeDiv(numerator, denominator).mul(100);
}

export function toFiniteNumber(value: DecimalLike): number {
  const numberValue = dec(value).toNumber();
  return Number.isFinite(numberValue) ? numberValue : 0;
}
