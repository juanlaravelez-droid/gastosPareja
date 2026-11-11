import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAvailableBalance,
  calculateGoalProgress,
  isValidDateInput,
  totalOf,
} from "../src/domain/finance.js";
import { getSavingsContributionSummary } from "../src/application/wallet-service.js";

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

test("summarizes goal and monthly contributions without assigning legacy savings", () => {
  const members = [
    { user_id: "member-1", member_index: 1 },
    { user_id: "member-2", member_index: 2 },
  ];
  const contributions = [
    { goal_id: "goal-1", contributor_id: "member-1", amount: 200, created_at: "2026-03-05T12:00:00.000Z" },
    { goal_id: "goal-1", contributor_id: "member-2", amount: 150, created_at: "2026-03-06T12:00:00.000Z" },
    { goal_id: "goal-1", contributor_id: "member-1", amount: 100, created_at: "2026-02-20T12:00:00.000Z" },
    { goal_id: "goal-2", contributor_id: "member-1", amount: 50, created_at: "2026-03-10T12:00:00.000Z" },
  ];

  const summary = getSavingsContributionSummary(
    { id: "goal-1", current_amount: 700, target_amount: 1000 },
    contributions,
    members,
    new Date("2026-03-20T12:00:00.000Z"),
  );

  assert.deepEqual(summary.memberAmounts.map((member) => member.amount), [300, 150]);
  assert.deepEqual(summary.memberAmounts.map((member) => member.goalPercentage), [30, 15]);
  assert.deepEqual(summary.monthlyAmounts.map((member) => member.amount), [250, 150]);
  assert.equal(summary.monthlyTotal, 400);
  assert.equal(summary.unattributedAmount, 250);
  assert.equal(summary.unattributedPercentage, 25);
});
