import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { renderHelp } from "./cli/parseArgs";
import { LEGACY_UNSUPPORTED_ENV_VARS, SUPPORTED_ENV_VARS } from "./configEnv";

function readmeContents(): string {
  return readFileSync(resolvePath(import.meta.dir, "..", "README.md"), "utf8");
}

describe("config docs/help contract", () => {
  it("documents every supported env var in README and CLI help", () => {
    const readme = readmeContents();
    const help = renderHelp();

    for (const envVar of SUPPORTED_ENV_VARS) {
      expect(readme).toContain(`\`${envVar}\``);
      expect(help).toContain(envVar);
    }
  });

  it("documents and enforces precedence guidance", () => {
    const readme = readmeContents();
    const help = renderHelp();
    const generalPriority = "CLI args -> profile (if applicable) -> env -> defaults";
    const credentialPriority =
      "profile env references -> env -> legacy CLI flags (only with BYBIT_ALLOW_INSECURE_CLI_SECRETS=1) -> defaults";

    expect(readme).toContain(generalPriority);
    expect(readme).toContain(credentialPriority);
    expect(help).toContain(generalPriority);
    expect(help).toContain(credentialPriority);
  });

  it("marks legacy aliases as unsupported and excludes them from help contract", () => {
    const readme = readmeContents();
    const help = renderHelp();

    for (const envVar of LEGACY_UNSUPPORTED_ENV_VARS) {
      expect(readme).toContain(`\`${envVar}\``);
      expect(help).not.toMatch(new RegExp(`(^|\\n)\\s*${envVar}=`, "m"));
    }
  });
});
