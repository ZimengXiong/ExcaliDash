import type { EnvVarSpec } from "./types";

export const updateCheckEnv: readonly EnvVarSpec[] = [
  {
    name: "UPDATE_CHECK_OUTBOUND",
    group: "Update check",
    kind: "boolean",
    default: "true",
    doc: "Allow outbound requests to GitHub to check for new releases.",
  },
  {
    name: "UPDATE_CHECK_GITHUB_TOKEN",
    group: "Update check",
    kind: "string",
    secret: true,
    aliases: ["GITHUB_TOKEN"],
    doc: "GitHub token used to raise the update-check API rate limit.",
  },
];

export const linkSharingEnv: readonly EnvVarSpec[] = [
  {
    name: "LINK_SHARE_EDIT_DEFAULT_TTL_MS",
    group: "Link sharing",
    kind: "number",
    default: "604800000",
    doc: "Default lifetime (ms) of edit share links (7 days).",
  },
  {
    name: "LINK_SHARE_VIEW_DEFAULT_TTL_MS",
    group: "Link sharing",
    kind: "number",
    default: "2592000000",
    doc: "Default lifetime (ms) of view share links (30 days).",
  },
  {
    name: "LINK_SHARE_MAX_TTL_MS",
    group: "Link sharing",
    kind: "number",
    default: "7776000000",
    doc: "Maximum allowed lifetime (ms) for any share link (90 days).",
  },
];
