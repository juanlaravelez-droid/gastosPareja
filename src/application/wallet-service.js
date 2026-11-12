import {
  calculateAvailableBalance,
  calculateGoalProgress,
  totalOf,
} from "../domain/finance.js";

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

export function getGoalProgressSegments(goal, contributionSummary) {
  const targetAmount = Number(goal.target_amount);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return { unattributed: 0, memberOne: 0, memberTwo: 0 };
  }

  let remainingAmount = Math.min(
    targetAmount,
    Math.max(0, Number(goal.current_amount) || 0),
  );
  const takeAmount = (amount) => {
    const allocated = Math.min(remainingAmount, Math.max(0, Number(amount) || 0));
    remainingAmount -= allocated;
    return allocated / targetAmount * 100;
  };
  const members = [...contributionSummary.memberAmounts]
    .sort((first, second) => first.memberIndex - second.memberIndex);

  return {
    unattributed: takeAmount(contributionSummary.unattributedAmount),
    memberOne: takeAmount(members.find((member) => member.memberIndex === 1)?.amount),
    memberTwo: takeAmount(members.find((member) => member.memberIndex === 2)?.amount),
  };
}

export function getSavingsContributionSummary(
  goal,
  goalContributions,
  members,
  now = new Date(),
) {
  const memberAmounts = members
    .map((member) => {
      const amount = goalContributions
        .filter((contribution) =>
          contribution.goal_id === goal.id && contribution.contributor_id === member.user_id)
        .reduce((total, contribution) => total + Number(contribution.amount), 0);
      return {
        userId: member.user_id,
        memberIndex: member.member_index,
        amount,
        goalPercentage: Number(goal.target_amount) > 0
          ? Math.min(100, Math.round((amount / Number(goal.target_amount)) * 100))
          : 0,
      };
    })
    .sort((first, second) => first.memberIndex - second.memberIndex);

  const trackedAmount = memberAmounts.reduce((total, member) => total + member.amount, 0);
  const monthlyAmounts = members
    .map((member) => ({
      userId: member.user_id,
      memberIndex: member.member_index,
      amount: goalContributions
        .filter((contribution) => {
          const createdAt = new Date(contribution.created_at);
          return contribution.contributor_id === member.user_id
            && createdAt.getFullYear() === now.getFullYear()
            && createdAt.getMonth() === now.getMonth();
        })
        .reduce((total, contribution) => total + Number(contribution.amount), 0),
    }))
    .sort((first, second) => first.memberIndex - second.memberIndex);
  const currentAmount = Number(goal.current_amount);

  return {
    memberAmounts,
    monthlyAmounts,
    monthlyTotal: monthlyAmounts.reduce((total, member) => total + member.amount, 0),
    unattributedAmount: Math.max(0, currentAmount - trackedAmount),
    unattributedPercentage: Number(goal.target_amount) > 0
      ? Math.min(100, Math.round((Math.max(0, currentAmount - trackedAmount) / Number(goal.target_amount)) * 100))
      : 0,
  };
}

export function getWalletSummary(state) {
  return {
    availableBalance: calculateAvailableBalance(state),
    incomeTotal: totalOf(state.incomes),
    expenseTotal: totalOf(state.expenses),
    savedTotal: totalOf(state.goals, "current_amount"),
  };
}

export function getDashboardSummary(state, now = new Date()) {
  const summary = getWalletSummary(state);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isCurrentMonth = (record) => {
    const createdAt = new Date(record.created_at);
    return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
  };
  const monthExpenses = state.expenses.filter(isCurrentMonth);
  const monthIncomes = state.incomes.filter(isCurrentMonth);
  const monthGoalContributions = (state.goalContributions || []).filter(isCurrentMonth);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const monthExpenseTotal = totalOf(monthExpenses);
  const monthIncomeTotal = totalOf(monthIncomes);
  const monthGoalContributionTotal = totalOf(monthGoalContributions);
  const monthlyAvailableBalance = Math.round(
    (monthIncomeTotal - monthExpenseTotal - monthGoalContributionTotal) * 100,
  ) / 100;
  const monthLabel = new Intl.DateTimeFormat("es", { month: "long" }).format(now);
  const capitalizedMonth = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`;
  const currentUserName = getMemberName(state, state.user.id);

  return {
    monthLabel: capitalizedMonth,
    currentUserId: state.user.id,
    overdueCount: 0,
    paidCount: monthExpenses.length,
    walletAvailableBalance: summary.availableBalance,
    monthlyAvailableBalance,
    monthIncomeTotal,
    monthGoalContributionTotal,
    monthExpenseTotal,
    projectedMonthExpense: daysElapsed > 0
      ? Math.round((monthExpenseTotal / daysElapsed * daysInMonth) * 100) / 100
      : monthExpenseTotal,
    personalContribution: totalOf(monthIncomes.filter((income) => income.author_id === state.user.id)),
    partnerContribution: totalOf(monthIncomes.filter((income) => income.author_id !== state.user.id)),
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
    partnerName: getMemberName(
      state,
      state.members.find((member) => member.user_id !== state.user.id)?.user_id,
    ),
  };
}

function getMemberName(state, userId) {
  const member = state.members.find((item) => item.user_id === userId);
  if (!member) return "Integrante";
  return member.member_index === 1
    ? state.wallet.nombre_miembro1
    : state.wallet.nombre_miembro2;
}
