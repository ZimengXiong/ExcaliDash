import * as fs from "fs";
import * as path from "path";
import { ENV_REGISTRY } from "./registry";
import type { EnvVarSpec } from "./registry";

const ENV_EXAMPLE_PATH = path.resolve(__dirname, "../../.env.example");

const GENERATED_NOTE =
  "GENERATED FILE — edit backend/src/config/registry/* and run npm run gen:env";

/** Groups in the order they first appear in the registry. */
const groupOrder = (): string[] => {
  const seen: string[] = [];
  for (const spec of ENV_REGISTRY) {
    if (!seen.includes(spec.group)) seen.push(spec.group);
  }
  return seen;
};

const specsInGroup = (group: string): EnvVarSpec[] =>
  ENV_REGISTRY.filter((spec) => spec.group === group);

/** True when the var should be emitted as an active (uncommented) assignment. */
const hasActiveDefault = (spec: EnvVarSpec): boolean =>
  spec.default !== undefined && !spec.secret && !spec.docsOnly;

const commentedValue = (spec: EnvVarSpec): string =>
  spec.example ?? spec.default ?? "";

/** Group whose vars are documented only; never emitted into .env.example. */
const FRONTEND_GROUP = "Frontend (build-time)";

export const renderEnvExample = (): string => {
  const lines: string[] = [];
  lines.push(`# ${GENERATED_NOTE}`);
  lines.push("# Backend environment variables. Copy to .env and adjust.");
  for (const group of groupOrder()) {
    if (group === FRONTEND_GROUP) continue;
    lines.push("");
    lines.push(`# === ${group} ===`);
    for (const spec of specsInGroup(group)) {
      lines.push(`# ${spec.doc}`);
      if (spec.kind === "enum" && spec.values) {
        lines.push(`# Allowed: ${spec.values.join(", ")}`);
      }
      if (spec.aliases && spec.aliases.length > 0) {
        lines.push(`# Deprecated aliases: ${spec.aliases.join(", ")}`);
      }
      if (hasActiveDefault(spec)) {
        lines.push(`${spec.name}=${spec.default}`);
      } else {
        lines.push(`# ${spec.name}=${commentedValue(spec)}`);
      }
    }
  }
  return lines.join("\n") + "\n";
};

if (require.main === module) {
  fs.writeFileSync(ENV_EXAMPLE_PATH, renderEnvExample());
  console.log(`Wrote ${path.relative(process.cwd(), ENV_EXAMPLE_PATH)}`);
}
