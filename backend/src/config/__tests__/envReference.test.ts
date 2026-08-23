import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { renderConfigDocs, renderEnvExample } from "../generateEnvReference";
import { ENV_REGISTRY } from "../registry";

const ENV_EXAMPLE_PATH = path.resolve(__dirname, "../../../.env.example");
const DOCS_PATH = path.resolve(__dirname, "../../../../docs/CONFIGURATION.md");

/** Normalize trailing whitespace so line-ending noise never fails the test. */
const normalize = (text: string): string =>
  text.replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n").trimEnd();

describe("generated env reference is fresh", () => {
  it("backend/.env.example matches the registry (run npm run gen:env)", () => {
    const onDisk = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
    expect(normalize(onDisk)).toBe(normalize(renderEnvExample()));
  });

  it("docs/CONFIGURATION.md matches the registry (run npm run gen:env)", () => {
    const onDisk = fs.readFileSync(DOCS_PATH, "utf8");
    expect(normalize(onDisk)).toBe(normalize(renderConfigDocs()));
  });
});

describe("registry sanity", () => {
  it("has no duplicate variable names", () => {
    const names = ENV_REGISTRY.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every docsOnly var a doc string", () => {
    for (const spec of ENV_REGISTRY.filter((s) => s.docsOnly)) {
      expect(spec.doc.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every enum var a non-empty values list", () => {
    for (const spec of ENV_REGISTRY.filter((s) => s.kind === "enum")) {
      expect(spec.values && spec.values.length).toBeGreaterThan(0);
    }
  });
});
