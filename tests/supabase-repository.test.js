import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseRepository } from "../src/infrastructure/supabase-repository.js";

function createWorkspaceClient() {
  const calls = [];
  let memberLookupCount = 0;
  const datasets = {
    wallets: { id: "wallet-1", nombre_miembro1: "Ana", nombre_miembro2: "Luis" },
    wallet_members: [{ user_id: "user-1", member_index: 1 }],
    incomes: [{ id: "income-1", amount: 50 }],
    expenses: [],
    settlements: [],
    goals: [],
  };

  return {
    calls,
    from(table) {
      const query = {
        select(columns) {
          calls.push({ kind: "select", table, columns });
          return query;
        },
        eq(column, value) {
          calls.push({ kind: "eq", table, column, value });
          return query;
        },
        order(column, options) {
          calls.push({ kind: "order", table, column, options });
          return query;
        },
        maybeSingle() {
          memberLookupCount += 1;
          return Promise.resolve({
            data: memberLookupCount === 1
              ? { wallet_id: "wallet-1", member_index: 1 }
              : null,
            error: null,
          });
        },
        single() {
          return Promise.resolve({ data: datasets[table], error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: datasets[table], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
  };
}

test("loads wallet records through the repository and maps workspace state", async () => {
  const client = createWorkspaceClient();
  const repository = createSupabaseRepository(client);

  const workspace = await repository.getWorkspace("user-1");

  assert.deepEqual(workspace, {
    wallet: { id: "wallet-1", nombre_miembro1: "Ana", nombre_miembro2: "Luis" },
    memberIndex: 1,
    members: [{ user_id: "user-1", member_index: 1 }],
    incomes: [{ id: "income-1", amount: 50 }],
    expenses: [],
    settlements: [],
    goals: [],
  });
  assert.ok(client.calls.some((call) => call.kind === "eq" && call.column === "user_id" && call.value === "user-1"));
});

test("maps email and password sign-in to Supabase Auth", async () => {
  const calls = [];
  const repository = createSupabaseRepository({
    auth: {
      signInWithPassword: async (credentials) => {
        calls.push(credentials);
        return { data: { user: { id: "user-1" } }, error: null };
      },
    },
  });

  const result = await repository.signInWithPassword("ana@example.com", "secure-password");

  assert.deepEqual(calls, [{ email: "ana@example.com", password: "secure-password" }]);
  assert.equal(result.data.user.id, "user-1");
});

test("maps goal update arguments to the existing database RPC", async () => {
  const calls = [];
  const repository = createSupabaseRepository({
    rpc: async (...args) => {
      calls.push(args);
      return { data: null, error: null };
    },
  });

  await repository.updateGoal("wallet-1", "goal-1", "Viaje", 5000, "2026-12-31");

  assert.deepEqual(calls, [[
    "update_goal",
    {
      p_wallet_id: "wallet-1",
      p_goal_id: "goal-1",
      p_title: "Viaje",
      p_target_amount: 5000,
      p_target_date: "2026-12-31",
    },
  ]]);
});

test("maps expense deletion to the wallet-scoped RPC", async () => {
  const calls = [];
  const repository = createSupabaseRepository({
    rpc: async (...args) => {
      calls.push(args);
      return { data: null, error: null };
    },
  });

  await repository.deleteExpense("wallet-1", "expense-1");

  assert.deepEqual(calls, [[
    "delete_expense",
    {
      p_wallet_id: "wallet-1",
      p_expense_id: "expense-1",
    },
  ]]);
});

test("maps settlement registration to the wallet-scoped RPC", async () => {
  const calls = [];
  const repository = createSupabaseRepository({
    rpc: async (...args) => {
      calls.push(args);
      return { data: null, error: null };
    },
  });

  await repository.registerSettlement("wallet-1", "member-1", "member-2", 125.5);

  assert.deepEqual(calls, [[
    "register_settlement",
    {
      p_wallet_id: "wallet-1",
      p_payer_id: "member-1",
      p_receiver_id: "member-2",
      p_amount: 125.5,
    },
  ]]);
});
