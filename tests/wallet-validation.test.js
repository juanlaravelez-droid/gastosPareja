import assert from "node:assert/strict";
import test from "node:test";
import {
  validateExpense,
  validateGoal,
  validateGoalContribution,
  validateIncome,
} from "../src/application/wallet-validation.js";

const members = [{ user_id: "member-1" }, { user_id: "member-2" }];

test("validates an income author and positive amount", () => {
  assert.match(validateIncome({ authorId: "other", amount: 10, members }), /Selecciona/);
  assert.match(validateIncome({ authorId: "member-1", amount: 0, members }), /mayor que cero/);
  assert.equal(validateIncome({ authorId: "member-1", amount: 10, members }), null);
});

test("validates expenses and available demo balance", () => {
  assert.match(validateExpense({ description: "a", amount: 10 }), /descripción/);
  assert.match(validateExpense({ description: "Taxi", amount: 0 }), /monto del gasto/);
  assert.match(
    validateExpense({ description: "Taxi", amount: 101, availableBalance: 100 }),
    /Saldo disponible insuficiente/,
  );
  assert.equal(validateExpense({ description: "Taxi", amount: 50, availableBalance: 100 }), null);
});

test("validates goal data and saved amount constraints", () => {
  assert.match(validateGoal({ title: "X", targetAmount: 100 }), /nombre de la meta/);
  assert.match(validateGoal({ title: "Viaje", targetAmount: 100, targetDate: "2025-02-29" }), /fecha objetivo/);
  assert.match(
    validateGoal({ title: "Viaje", targetAmount: 99, currentAmount: 100 }),
    /no puede ser menor/,
  );
  assert.equal(validateGoal({ title: "Viaje", targetAmount: 100, targetDate: "2025-12-31" }), null);
});

test("validates goal contributions against balance and remaining target", () => {
  const goal = { current_amount: 80, target_amount: 100 };
  assert.match(validateGoalContribution({ amount: 0, goal, availableBalance: 100 }), /aporte debe/);
  assert.match(validateGoalContribution({ amount: 20, goal: null, availableBalance: 100 }), /No se encontró/);
  assert.match(validateGoalContribution({ amount: 30, goal, availableBalance: 100 }), /supera el monto/);
  assert.match(validateGoalContribution({ amount: 20, goal, availableBalance: 10 }), /Saldo disponible insuficiente/);
  assert.equal(validateGoalContribution({ amount: 20, goal, availableBalance: 20 }), null);
});
