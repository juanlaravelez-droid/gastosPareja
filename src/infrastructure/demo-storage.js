const DEMO_STORAGE_KEY = "billetera-demo-state-v1";
const DEMO_ACTIVE_KEY = "billetera-demo-active-v1";

export function createDemoState(now = Date.now()) {
  const firstMemberId = "demo-member-1";
  const secondMemberId = "demo-member-2";
  const dateDaysAgo = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return {
    user: { id: firstMemberId, email: "Demo local" },
    wallet: { id: "demo-wallet", nombre_miembro1: "Juan", nombre_miembro2: "Isa" },
    memberIndex: 1,
    members: [
      { user_id: firstMemberId, member_index: 1 },
      { user_id: secondMemberId, member_index: 2 },
    ],
    incomes: [
      { id: "demo-income-1", author_id: firstMemberId, amount: 2200000, created_at: dateDaysAgo(6) },
      { id: "demo-income-2", author_id: secondMemberId, amount: 1800000, created_at: dateDaysAgo(3) },
    ],
    expenses: [
      { id: "demo-expense-1", author_id: secondMemberId, description: "Mercado", amount: 245000, created_at: dateDaysAgo(2) },
    ],
    goals: [
      {
        id: "demo-goal-1",
        title: "Viaje juntos",
        target_amount: 1500000,
        target_date: new Date(now + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        current_amount: 300000,
        created_at: dateDaysAgo(5),
      },
    ],
  };
}

export function createDemoStorage(storage) {
  function readDemoState() {
    const saved = storage.getItem(DEMO_STORAGE_KEY);
    if (!saved) return createDemoState();

    const data = JSON.parse(saved);
    if (
      !data?.wallet ||
      typeof data.wallet.nombre_miembro1 !== "string" ||
      typeof data.wallet.nombre_miembro2 !== "string" ||
      !Array.isArray(data.members) ||
      !Array.isArray(data.incomes) ||
      !Array.isArray(data.expenses) ||
      !Array.isArray(data.goals)
    ) {
      throw new Error("Los datos guardados de la demo están incompletos. Borra los datos locales del sitio para iniciar una demo nueva.");
    }

    return {
      ...data,
      user: { id: "demo-member-1", email: "Demo local" },
      memberIndex: 1,
    };
  }

  return {
    readDemoState,
    saveDemoState(state) {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
        wallet: state.wallet,
        members: state.members,
        incomes: state.incomes,
        expenses: state.expenses,
        goals: state.goals,
      }));
    },
    isActive() {
      return storage.getItem(DEMO_ACTIVE_KEY) === "true";
    },
    setActive(active) {
      if (active) storage.setItem(DEMO_ACTIVE_KEY, "true");
      else storage.removeItem(DEMO_ACTIVE_KEY);
    },
  };
}
