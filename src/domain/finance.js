export function totalOf(rows, field = "amount") {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

export function calculateAvailableBalance({ incomes, expenses, goals }) {
  return totalOf(incomes) - totalOf(expenses) - totalOf(goals, "current_amount");
}

export function calculateGoalProgress(goal) {
  return goal.target_amount <= 0
    ? 0
    : Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
}

export function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
