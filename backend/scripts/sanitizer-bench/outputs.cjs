// node outputs.cjs sanitize <previews.json> <out.json>
//   runs sanitizeSvg of the image it is started in over every preview
// node outputs.cjs compare <a.json> <b.json>
//   counts byte-identical outputs of two runs
const fs = require("fs");

const [command, first, second] = process.argv.slice(2);
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

if (command === "sanitize") {
  const { sanitizeSvg } = require("/app/dist/security.js");
  const previews = read(first).map((row) =>
    typeof row === "string" ? row : row.preview,
  );
  fs.writeFileSync(
    second,
    JSON.stringify(previews.map((preview) => sanitizeSvg(preview))),
  );
  console.log(`sanitized ${previews.length} previews into ${second}`);
} else if (command === "compare") {
  const a = read(first);
  const b = read(second);
  const differ = a
    .map((out, i) => (out === b[i] ? -1 : i))
    .filter((i) => i >= 0);
  console.log(
    `identical ${a.length - differ.length}/${a.length}${differ.length ? `, differ at ${differ.join(", ")}` : ""}`,
  );
} else {
  console.error(
    "usage: outputs.cjs sanitize <previews.json> <out.json> | compare <a.json> <b.json>",
  );
  process.exit(2);
}
