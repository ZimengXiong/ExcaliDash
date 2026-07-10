import type { EnvVarSpec } from "./types";
import { serverEnv, databaseEnv } from "./server";
import { authEnv } from "./auth";
import { oidcEnv } from "./oidc";
import { securityEnv } from "./security";
import { storageEnv, backupEnv } from "./storage";
import { updateCheckEnv, linkSharingEnv } from "./misc";
import { aiEnv } from "./ai";
import { frontendEnv } from "./frontend";

export type { EnvKind, EnvVarSpec } from "./types";

export const ENV_REGISTRY: readonly EnvVarSpec[] = [
  ...serverEnv,
  ...databaseEnv,
  ...authEnv,
  ...oidcEnv,
  ...securityEnv,
  ...storageEnv,
  ...backupEnv,
  ...updateCheckEnv,
  ...linkSharingEnv,
  ...aiEnv,
  ...frontendEnv,
];

const SPEC_BY_NAME = new Map<string, EnvVarSpec>(
  ENV_REGISTRY.map((spec) => [spec.name, spec]),
);

export const getSpec = (name: string): EnvVarSpec => {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) {
    throw new Error(`Unknown environment variable: ${name} is not declared in the registry`);
  }
  return spec;
};
