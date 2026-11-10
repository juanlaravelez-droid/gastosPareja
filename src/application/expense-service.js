export function addExpense(expenses, expense) {
  return [expense, ...expenses];
}

export function deleteExpense(expenses, expenseId) {
  return expenses.filter((expense) => expense.id !== expenseId);
}

export function addSettlement(settlements, settlement) {
  return [settlement, ...settlements];
}

export function calculateExpenseSplit(expenses, members, settlements = []) {
  const sortedMembers = [...members].sort((first, second) => first.member_index - second.member_index);
  if (sortedMembers.length === 0) return [];

  const balances = sortedMembers.map((member) => ({
    userId: member.user_id,
    memberIndex: member.member_index,
    paidCents: 0,
    owedCents: 0,
  }));

  for (const expense of expenses) {
    const amountCents = Math.round(Number(expense.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      throw new Error("No se puede dividir un gasto con un monto inválido.");
    }

    const payer = balances.find((balance) => balance.userId === expense.author_id);
    if (!payer) throw new Error("No se encontró a quien registró el gasto.");
    payer.paidCents += amountCents;

    const shareCents = Math.floor(amountCents / balances.length);
    let remainingCents = amountCents - shareCents * balances.length;
    for (const balance of balances) {
      balance.owedCents += shareCents + (remainingCents > 0 ? 1 : 0);
      remainingCents -= remainingCents > 0 ? 1 : 0;
    }
  }

  for (const settlement of settlements) {
    const amountCents = Math.round(Number(settlement.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("No se puede calcular una liquidación con un monto inválido.");
    }

    const payer = balances.find((balance) => balance.userId === settlement.payer_id);
    const receiver = balances.find((balance) => balance.userId === settlement.receiver_id);
    if (!payer || !receiver || payer === receiver) {
      throw new Error("La liquidación no corresponde a dos integrantes de la billetera.");
    }
    payer.paidCents += amountCents;
    receiver.owedCents += amountCents;
  }

  return balances.map(({ userId, memberIndex, paidCents, owedCents }) => ({
    userId,
    memberIndex,
    paid: paidCents / 100,
    owed: owedCents / 100,
    netBalance: (paidCents - owedCents) / 100,
  }));
}
