const assert = require("node:assert/strict");
require("../js/catalogue.js");
const { order, validDate } = globalThis.SaintCatalogue;
assert.equal(validDate("2026-02-30"), false);
assert.equal(validDate("2024-02-29"), true);
assert.deepEqual(order([]), []);
const old = { slug: "old", releaseDate: "2025-01-01", featured: true };
const latest = { slug: "latest", releaseDate: "2026-01-01" };
assert.equal(order([old, latest])[0], old);
const unknown = { slug: "new-undated", releaseDate: "" };
assert.equal(order([unknown, old])[0], unknown);
assert.equal(order([old, unknown])[0], old);
const placeholder = {
  slug: "demo",
  placeholder: true,
  releaseDate: "2099-01-01",
};
assert.equal(order([placeholder, latest, old])[0], latest);
const input = [old, latest];
order(input);
assert.equal(input[0], old);
console.log(
  "PASS: newest release, partial dates, invalid dates, placeholders, empty catalogue and no input mutation.",
);

const { fragments } = globalThis.SaintCatalogue;
const third = { slug: "third" },
  fourth = { slug: "fourth" },
  fifth = { slug: "fifth" };
assert.deepEqual(
  fragments([latest, old, third, fourth, fifth], "latest").map((t) => t.slug),
  ["old", "third", "fourth"],
);
assert.deepEqual(
  fragments([latest, old, third, fourth], "latest", [
    "latest",
    "third",
    "third",
    "missing",
  ]).map((t) => t.slug),
  ["third", "old", "fourth"],
);
assert.deepEqual(fragments([latest], "latest"), []);
console.log(
  "PASS: automatic Fragments, curated overrides, duplicates and featured exclusion.",
);
