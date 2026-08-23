import * as fs from "fs";
import * as path from "path";
import { ENV_REGISTRY } from "./registry";
import type { EnvVarSpec } from "./registry";

const ENV_EXAMPLE_PATH = path.resolve(__dirname, "../../.env.example");
const DOCS_PATH = path.resolve(__dirname, "../../../docs/CONFIGURATION.md");

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

const requiredLabel = (spec: EnvVarSpec): string => {
  if (spec.requiredInProduction) return "In production";
  if (spec.requiredWhenOidcEnabled) return "When OIDC enabled";
  return "No";
};

const defaultLabel = (spec: EnvVarSpec): string => {
  if (spec.default !== undefined) return `\`${spec.default}\``;
  if (spec.secret) return "_(none — secret)_";
  return "—";
};

const descriptionLabel = (spec: EnvVarSpec): string => {
  const parts: string[] = [spec.doc];
  if (spec.kind === "enum" && spec.values) {
    parts.push(`Allowed: ${spec.values.join(", ")}.`);
  }
  if (spec.aliases && spec.aliases.length > 0) {
    parts.push(`Deprecated aliases: ${spec.aliases.join(", ")}.`);
  }
  if (spec.docsOnly) {
    parts.push("Consumed outside the backend; documented only.");
  }
  return parts.join(" ");
};

export const renderConfigDocs = (): string => {
  const lines: string[] = [];
  lines.push(`<!-- ${GENERATED_NOTE} -->`);
  lines.push("");
  lines.push("# Configuration Reference");
  lines.push("");
  lines.push(
    "All backend environment variables are declared once in `backend/src/config/registry/`.",
  );
  lines.push(
    "This file and `backend/.env.example` are generated from that registry; do not edit them by hand.",
  );
  for (const group of groupOrder()) {
    lines.push("");
    lines.push(`## ${group}`);
    lines.push("");
    lines.push("| Variable | Default | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const spec of specsInGroup(group)) {
      lines.push(
        `| \`${spec.name}\` | ${defaultLabel(spec)} | ${requiredLabel(spec)} | ${descriptionLabel(spec)} |`,
      );
    }
  }
  return lines.join("\n") + "\n";
};

if (require.main === module) {
  fs.writeFileSync(ENV_EXAMPLE_PATH, renderEnvExample());
  fs.writeFileSync(DOCS_PATH, renderConfigDocs());
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${path.relative(process.cwd(), ENV_EXAMPLE_PATH)} and ${path.relative(process.cwd(), DOCS_PATH)}`,
  );
}
