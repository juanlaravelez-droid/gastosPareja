import {
  calculateAvailableBalance,
  calculateGoalProgress,
  totalOf,
} from "../domain/finance.js";
import { calculateExpenseSplit } from "./expense-service.js?v=1";

export {
  calculateAvailableBalance,
  calculateGoalProgress,
  totalOf,
};

export function getGoalSummary(goal, today = new Date().toISOString().slice(0, 10)) {
  const currentAmount = Number(goal.current_amount);
  const targetAmount = Number(goal.target_amount);
  const complete = currentAmount >= targetAmount;
  return {
    complete,
    remaining: Math.max(0, targetAmount - currentAmount),
    progress: calculateGoalProgress({
      current_amount: currentAmount,
      target_amount: targetAmount,
    }),
    overdue: !complete && Boolean(goal.target_date) && goal.target_date < today,
  };
}

export function getWalletSummary(state) {
  const contributions = state.members
    .map((member) => ({
      memberIndex: member.member_index,
      amount: totalOf(state.incomes.filter((income) => income.author_id === member.user_id)),
    }))
    .sort((first, second) => first.memberIndex - second.memberIndex);
  const firstContribution = contributions[0]?.amount || 0;
  const secondContribution = contributions[1]?.amount || 0;
  const totalContributions = firstContribution + secondContribution;
  const difference = Math.round((firstContribution - secondContribution) * 100) / 100;
  const firstPercentage = totalContributions > 0
    ? Math.round((firstContribution / totalContributions) * 100)
    : 50;

  return {
    availableBalance: calculateAvailableBalance(state),
    incomeTotal: totalOf(state.incomes),
    expenseTotal: totalOf(state.expenses),
    savedTotal: totalOf(state.goals, "current_amount"),
    contributions: [firstContribution, secondContribution],
    percentages: [firstPercentage, totalContributions > 0 ? 100 - firstPercentage : 50],
    contributionStatus: totalContributions === 0
      ? "none"
      : Math.abs(difference) < 1
        ? "balanced"
        : difference > 0
          ? "first-ahead"
          : "second-ahead",
    contributionDifference: Math.abs(difference),
    expenseSplit: calculateExpenseSplit(state.expenses, state.members, state.settlements || []),
  };
}

export function getDashboardSummary(state, now = new Date()) {
  const summary = getWalletSummary(state);
  const currentUser = summary.expenseSplit.find((member) => member.userId === state.user.id);
  const partner = summary.expenseSplit.find((member) => member.userId !== state.user.id);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthExpenses = state.expenses.filter((expense) => {
    const createdAt = new Date(expense.created_at);
    return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
  });
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const monthExpenseTotal = totalOf(monthExpenses);
  const settlementAmount = Math.round(Math.abs(currentUser?.netBalance || 0) * 100) / 100;
  const monthLabel = new Intl.DateTimeFormat("es", { month: "long" }).format(now);
  const capitalizedMonth = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`;
  const currentUserName = getMemberName(state, state.user.id);

  return {
    monthLabel: capitalizedMonth,
    currentUserId: state.user.id,
    pendingCount: settlementAmount > 0 ? 1 : 0,
    overdueCount: 0,
    paidCount: monthExpenses.length,
    netBalance: currentUser?.netBalance || 0,
    settlementAmount,
    settlementPayerId: (currentUser?.netBalance || 0) < 0 ? state.user.id : partner?.userId || null,
    settlementReceiverId: (currentUser?.netBalance || 0) < 0 ? partner?.userId || null : state.user.id,
    settlementPayerName: (currentUser?.netBalance || 0) < 0
      ? getMemberName(state, state.user.id)
      : getMemberName(state, partner?.userId),
    settlementReceiverName: (currentUser?.netBalance || 0) < 0
      ? getMemberName(state, partner?.userId)
      : getMemberName(state, state.user.id),
    monthExpenseTotal,
    projectedMonthExpense: daysElapsed > 0
      ? Math.round((monthExpenseTotal / daysElapsed * daysInMonth) * 100) / 100
      : monthExpenseTotal,
    personalContribution: summary.contributions[state.memberIndex - 1] || 0,
    partnerContribution: summary.contributions[(state.memberIndex === 1 ? 1 : 0)] || 0,
    incomeTotal: summary.incomeTotal,
    expenseTotal: summary.expenseTotal,
    savedTotal: summary.savedTotal,
    currentUserName,
    avatarInitials: currentUserName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase("es"))
      .join(""),
    partnerName: getMemberName(state, partner?.userId),
  };
}

function getMemberName(state, userId) {
  const member = state.members.find((item) => item.user_id === userId);
  if (!member) return "Integrante";
  return member.member_index === 1
    ? state.wallet.nombre_miembro1
    : state.wallet.nombre_miembro2;
}
