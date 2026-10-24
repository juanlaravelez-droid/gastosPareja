import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAvailableBalance,
  calculateGoalProgress,
  isValidDateInput,
  totalOf,
} from "../src/domain/finance.js";

test("calculates totals and available balance", () => {
  const wallet = {
    incomes: [{ amount: 1000 }, { amount: "500" }],
    expenses: [{ amount: 200 }],
    goals: [{ current_amount: 300 }],
  };

  assert.equal(totalOf(wallet.incomes), 1500);
  assert.equal(calculateAvailableBalance(wallet), 1000);
});

test("caps goal progress at zero and one hundred percent", () => {
  assert.equal(calculateGoalProgress({ current_amount: 4, target_amount: 10 }), 40);
  assert.equal(calculateGoalProgress({ current_amount: 12, target_amount: 10 }), 100);
  assert.equal(calculateGoalProgress({ current_amount: 0, target_amount: 0 }), 0);
});

test("accepts real calendar dates and rejects invalid dates", () => {
  assert.equal(isValidDateInput("2024-02-29"), true);
  assert.equal(isValidDateInput("2025-02-29"), false);
  assert.equal(isValidDateInput("24-02-29"), false);
});
