export function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function fmtNum(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4
  }).format(value);
}

export function fmtIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
}
