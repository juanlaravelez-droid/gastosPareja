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
  const siteUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !siteUrl) {
    console.error("Faltan secretos requeridos para invite-member.");
    return respond({ error: "La función de invitaciones aún no está configurada." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user?.email) return respond({ error: "La sesión no es válida." }, 401);

  let payload: { wallet_id?: string; email?: string };
  try {
    payload = await request.json();
  } catch {
    return respond({ error: "La solicitud no contiene datos válidos." }, 400);
  }

  const walletId = payload.wallet_id?.trim();
  const email = payload.email?.trim().toLowerCase();
  if (!walletId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ error: "Indica una billetera y un correo válido." }, 400);
  }
  if (email === userData.user.email.toLowerCase()) {
    return respond({ error: "La invitación debe enviarse a otra persona." }, 400);
  }

  const { data: inviteId, error: inviteError } = await adminClient.rpc("create_wallet_invitation", {
    p_wallet_id: walletId,
    p_email: email,
    p_invited_by: userData.user.id,
  });
  if (inviteError) {
    console.error("No se pudo crear la invitación.", inviteError);
    return respond({ error: inviteError.message }, 409);
  }

  const mailClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: emailError } = await mailClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: siteUrl,
      shouldCreateUser: true,
    },
  });
  if (emailError) {
    console.error("No se pudo enviar el enlace de acceso al invitado.", emailError);
    const { error: cleanupError } = await adminClient
      .from("wallet_invites")
      .delete()
      .eq("id", inviteId);
    if (cleanupError) console.error("No se pudo retirar la invitación sin enviar.", cleanupError);
    return respond({ error: "No se pudo enviar el correo. Revisa la configuración de SMTP y vuelve a intentarlo." }, 502);
  }

  return respond({ message: "Correo enviado. La persona debe abrir el enlace para aceptar la invitación." });
});
