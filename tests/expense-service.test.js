import assert from "node:assert/strict";
import test from "node:test";
import {
  addExpense,
  addSettlement,
  calculateExpenseSplit,
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

test("splits expenses equally and calculates each member's net balance in cents", () => {
  const split = calculateExpenseSplit([
    { author_id: "member-1", amount: 10.01 },
    { author_id: "member-2", amount: 5 },
  ], members);

  assert.deepEqual(split, [
    { userId: "member-1", memberIndex: 1, paid: 10.01, owed: 7.51, netBalance: 2.5 },
    { userId: "member-2", memberIndex: 2, paid: 5, owed: 7.5, netBalance: -2.5 },
  ]);
  assert.equal(split.reduce((total, member) => total + member.netBalance, 0), 0);
});

test("returns wallet totals and contribution comparison as business data", () => {
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
  assert.deepEqual(summary.contributions, [100, 50]);
  assert.deepEqual(summary.percentages, [67, 33]);
  assert.equal(summary.contributionStatus, "first-ahead");
  assert.equal(summary.contributionDifference, 50);
  assert.equal(summary.expenseSplit[0].netBalance, 10);
  assert.equal(summary.expenseSplit[1].netBalance, -10);
});

test("builds dashboard metrics and updates the net balance after a settlement", () => {
  const state = {
    user: { id: "member-1" },
    wallet: { nombre_miembro1: "Ana", nombre_miembro2: "Luis" },
    memberIndex: 1,
    members,
    incomes: [
      { author_id: "member-1", amount: 700 },
      { author_id: "member-2", amount: 300 },
    ],
    expenses: [{
      id: "expense-1",
      author_id: "member-2",
      amount: 300,
      created_at: "2025-01-10T12:00:00.000Z",
    }],
    settlements: [],
    goals: [{ current_amount: 250 }],
  };
  const now = new Date("2025-01-15T12:00:00.000Z");
  const summary = getDashboardSummary(state, now);

  assert.equal(summary.monthLabel, "Enero");
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.netBalance, -150);
  assert.equal(summary.settlementPayerId, "member-1");
  assert.equal(summary.settlementReceiverId, "member-2");
  assert.equal(summary.personalContribution, 700);
  assert.equal(summary.partnerContribution, 300);
  assert.equal(summary.projectedMonthExpense, 620);
  assert.equal(summary.savedTotal, 250);

  state.settlements = addSettlement(state.settlements, {
    payer_id: "member-1",
    receiver_id: "member-2",
    amount: 150,
  });
  assert.equal(getDashboardSummary(state, now).netBalance, 0);
  assert.equal(getDashboardSummary(state, now).pendingCount, 0);
});
