export function addExpense(expenses, expense) {
  return [expense, ...expenses];
}

export function deleteExpense(expenses, expenseId) {
  return expenses.filter((expense) => expense.id !== expenseId);
}
