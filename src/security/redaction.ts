export type SecretPresence = "present" | "missing";

export interface SecretRedaction {
  presence: SecretPresence;
  display: string;
}

export interface IpWhitelistRedaction {
  restricted: boolean;
  count: number;
  display: string;
}

function normalizeString(input: string | undefined | null): string {
  return typeof input === "string" ? input.trim() : "";
}

export function redactSecretValue(input: string | undefined | null): SecretRedaction {
  const normalized = normalizeString(input);
  if (!normalized) {
    return {
      presence: "missing",
      display: "<missing>"
    };
  }

  return {
    presence: "present",
    display: "<redacted>"
  };
}

export function redactIpWhitelist(input: readonly string[] | undefined | null): IpWhitelistRedaction {
  const entries = (input ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (entries.length === 0) {
    return {
      restricted: false,
      count: 0,
      display: "not configured"
    };
  }

  const suffix = entries.length === 1 ? "entry" : "entries";
  return {
    restricted: true,
    count: entries.length,
    display: `configured (${entries.length} ${suffix})`
  };
}
