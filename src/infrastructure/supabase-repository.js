export function createSupabaseRepository(client) {
  async function getWorkspace(userId) {
    let membershipResult = await client
      .from("wallet_members")
      .select("wallet_id, member_index")
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipResult.error) throw membershipResult.error;

    if (!membershipResult.data) {
      const invitationResult = await client.functions.invoke("accept-invitation", { body: {} });
      if (invitationResult.error) throw invitationResult.error;
      if (invitationResult.data?.accepted) {
        membershipResult = await client
          .from("wallet_members")
          .select("wallet_id, member_index")
          .eq("user_id", userId)
          .maybeSingle();
        if (membershipResult.error) throw membershipResult.error;
      }
    }

    if (!membershipResult.data) return null;

    const walletId = membershipResult.data.wallet_id;
    const results = await Promise.all([
      client.from("wallets").select("id, nombre_miembro1, nombre_miembro2").eq("id", walletId).single(),
      client.from("wallet_members").select("user_id, member_index").eq("wallet_id", walletId),
      client.from("incomes").select("id, author_id, amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: false }),
      client.from("expenses").select("id, author_id, description, amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: false }),
      client.from("goals").select("id, title, target_amount, target_date, current_amount, created_at").eq("wallet_id", walletId).order("created_at", { ascending: true }),
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    const [wallet, members, incomes, expenses, goals] = results.map((result) => result.data);
    return {
      wallet,
      memberIndex: membershipResult.data.member_index,
      members,
      incomes,
      expenses,
      goals,
    };
  }

  return {
    getSession: () => client.auth.getSession(),
    onAuthStateChange: (callback) => client.auth.onAuthStateChange(callback),
    signInWithOtp: (email, redirectTo) => client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    }),
    signOut: () => client.auth.signOut(),
    getWorkspace,
    createWallet: (nombre1, nombre2) => client.rpc("create_wallet", {
      p_nombre_miembro1: nombre1,
      p_nombre_miembro2: nombre2,
    }),
    updateWalletNames: (walletId, nombre1, nombre2) => client.rpc("update_wallet_names", {
      p_wallet_id: walletId,
      p_nombre_miembro1: nombre1,
      p_nombre_miembro2: nombre2,
    }),
    createIncome: (walletId, authorId, amount) => client.from("incomes").insert({
      wallet_id: walletId,
      author_id: authorId,
      amount,
    }),
    registerExpense: (walletId, description, amount) => client.rpc("register_expense", {
      p_wallet_id: walletId,
      p_description: description,
      p_amount: amount,
    }),
    createGoal: (walletId, title, targetAmount, targetDate) => client.from("goals").insert({
      wallet_id: walletId,
      title,
      target_amount: targetAmount,
      target_date: targetDate,
    }),
    updateGoal: (walletId, goalId, title, targetAmount, targetDate) => client.rpc("update_goal", {
      p_wallet_id: walletId,
      p_goal_id: goalId,
      p_title: title,
      p_target_amount: targetAmount,
      p_target_date: targetDate,
    }),
    deleteGoal: (walletId, goalId) => client.rpc("delete_goal", {
      p_wallet_id: walletId,
      p_goal_id: goalId,
    }),
    contributeToGoal: (walletId, goalId, amount) => client.rpc("contribute_to_goal", {
      p_wallet_id: walletId,
      p_goal_id: goalId,
      p_amount: amount,
    }),
    deleteIncome: (walletId, incomeId) => client.rpc("delete_income", {
      p_wallet_id: walletId,
      p_income_id: incomeId,
    }),
    inviteMember: (walletId, email) => client.functions.invoke("invite-member", {
      body: { wallet_id: walletId, email },
    }),
  };
}
