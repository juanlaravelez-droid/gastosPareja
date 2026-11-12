import assert from "node:assert/strict";
import test from "node:test";
import {
  addExpense,
  deleteExpense,
} from "../src/application/expense-service.js";
import { getDashboardSummary, getWalletSummary } from "../src/application/wallet-service.js";

const members = [
  { user_id: "member-2", member_index: 2 },
  { user_id: "member-1", member_index: 1 },
];

test("adds and removes expenses without mutating the original collection", () => {
  const expenses = [{ id: "expense-1" }];
  const nextExpenses = addExpense(expenses, { id: "expense-2" });

  assert.deepEqual(expenses, [{ id: "expense-1" }]);
  assert.deepEqual(nextExpenses, [{ id: "expense-2" }, { id: "expense-1" }]);
  assert.deepEqual(deleteExpense(nextExpenses, "expense-2"), [{ id: "expense-1" }]);
});

test("returns shared wallet totals without individual debt balances", () => {
  const summary = getWalletSummary({
    incomes: [
      { author_id: "member-1", amount: 100 },
      { author_id: "member-2", amount: 50 },
    ],
    expenses: [{ author_id: "member-1", amount: 20 }],
    goals: [{ current_amount: 10 }],
    members,
  });

  assert.equal(summary.availableBalance, 120);
  assert.equal(summary.incomeTotal, 150);
  assert.equal(summary.expenseTotal, 20);
  assert.equal(summary.savedTotal, 10);
  assert.equal(summary.expenseSplit, undefined);
});

test("builds monthly fund, contribution, and expense projection without settlement balances", () => {
  const state = {
    user: { id: "member-1" },
    wallet: { nombre_miembro1: "Ana", nombre_miembro2: "Luis" },
    memberIndex: 1,
    members,
    incomes: [
      { author_id: "member-1", amount: 700, created_at: "2025-01-03T12:00:00.000Z" },
      { author_id: "member-2", amount: 300, created_at: "2025-01-04T12:00:00.000Z" },
      { author_id: "member-2", amount: 900, created_at: "2024-12-20T12:00:00.000Z" },
    ],
    expenses: [{
      id: "expense-1",
      author_id: "member-2",
      amount: 300,
      created_at: "2025-01-10T12:00:00.000Z",
    }, {
      id: "expense-old",
      author_id: "member-2",
      amount: 100,
      created_at: "2024-12-10T12:00:00.000Z",
    }],
    goalContributions: [{
      goal_id: "goal-1",
      contributor_id: "member-2",
      amount: 100,
      created_at: "2025-01-11T12:00:00.000Z",
    }, {
      goal_id: "goal-1",
      contributor_id: "member-1",
      amount: 250,
      created_at: "2024-12-12T12:00:00.000Z",
    }],
    goals: [{ current_amount: 350 }],
  };
  const now = new Date("2025-01-15T12:00:00.000Z");
  const summary = getDashboardSummary(state, now);

  assert.equal(summary.monthLabel, "Enero");
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.monthIncomeTotal, 1000);
  assert.equal(summary.monthExpenseTotal, 300);
  assert.equal(summary.monthGoalContributionTotal, 100);
  assert.equal(summary.monthlyAvailableBalance, 600);
  assert.equal(summary.walletAvailableBalance, 1150);
  assert.equal(summary.personalContribution, 700);
  assert.equal(summary.partnerContribution, 300);
  assert.equal(summary.projectedMonthExpense, 620);
  assert.equal(summary.savedTotal, 350);
  assert.equal(summary.pendingCount, undefined);
  assert.equal(summary.netBalance, undefined);
});
