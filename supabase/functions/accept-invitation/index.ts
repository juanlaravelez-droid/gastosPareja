import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond({ error: "Debes iniciar sesión." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan secretos requeridos para accept-invitation.");
    return respond({ error: "La aceptación de invitaciones aún no está configurada." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user?.email) return respond({ error: "La sesión no es válida." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: accepted, error } = await adminClient.rpc("accept_wallet_invitation", {
    p_user_id: userData.user.id,
    p_email: userData.user.email,
  });
  if (error) {
    console.error("No se pudo aceptar la invitación.", error);
    return respond({ error: error.message }, 409);
  }

  return respond({ accepted: Boolean(accepted) });
});
