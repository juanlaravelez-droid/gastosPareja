export function parseMonthlyQuota(value) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return 0;
  const amount = Number.parseInt(digits, 10);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatMonthlyQuotaInput(value) {
  if (!String(value).replace(/\D/g, "")) return "";
  const amount = parseMonthlyQuota(value);
  if (amount === null) return "";
  return amount.toLocaleString("es-CO");
}

export function getMonthlyQuotaProjection(goal, monthlyQuota, now = new Date()) {
  const target = Number(goal.target_amount);
  const saved = Number(goal.current_amount);
  const remaining = Math.max(0, target - saved);
  if (remaining === 0) return { complete: true, months: 0, date: null };

  const monthlyTotal = Number(monthlyQuota?.juan || 0) + Number(monthlyQuota?.isa || 0);
  if (monthlyTotal <= 0) return { complete: false, months: null, date: null };

  const months = Math.ceil(remaining / monthlyTotal);
  return {
    complete: false,
    months,
    date: new Date(now.getFullYear(), now.getMonth() + months, 1),
  };
}
