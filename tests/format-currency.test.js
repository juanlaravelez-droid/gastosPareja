import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrency } from "../src/presentation/formatCurrency.js";

test("formats Colombian peso amounts without fractional digits", () => {
  assert.equal(formatCurrency(816666.67).replace(/\s/g, " "), "$ 816.667");
});
