import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMonthlyQuotaInput,
  getMonthlyQuotaProjection,
  parseMonthlyQuota,
} from "../src/application/monthly-quota.js";

test("parses and formats monthly quota values as grouped integers", () => {
  assert.equal(parseMonthlyQuota("300.000"), 300000);
  assert.equal(parseMonthlyQuota("$ 1,250,000"), 1250000);
  assert.equal(parseMonthlyQuota(""), 0);
  assert.equal(parseMonthlyQuota("999999999999999999999"), null);
  assert.equal(formatMonthlyQuotaInput(""), "");
  assert.equal(formatMonthlyQuotaInput("300000"), "300.000");
});

test("projects the goal completion month from the combined monthly quota", () => {
  const projection = getMonthlyQuotaProjection(
    { target_amount: 1500000, current_amount: 300000 },
    { juan: 300000, isa: 200000 },
    new Date(2026, 10, 11),
  );

  assert.equal(projection.months, 3);
  assert.equal(projection.date.getFullYear(), 2027);
  assert.equal(projection.date.getMonth(), 1);
});

test("handles completed goals and missing monthly quotas", () => {
  assert.deepEqual(
    getMonthlyQuotaProjection(
      { target_amount: 100, current_amount: 100 },
      { juan: 100, isa: 100 },
    ),
    { complete: true, months: 0, date: null },
  );
  assert.deepEqual(
    getMonthlyQuotaProjection(
      { target_amount: 100, current_amount: 50 },
      { juan: 0, isa: 0 },
    ),
    { complete: false, months: null, date: null },
  );
});
