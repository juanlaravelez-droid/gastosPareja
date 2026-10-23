# Configurar la billetera compartida

La app usa Supabase para las cuentas, los datos compartidos y las invitaciones. Para iniciar, se necesita una cuenta y un proyecto Supabase. La configuración del cliente se lee desde `supabase-config.example.js`; la URL y la clave publicable (anon) no son secretos y pueden estar en el repositorio. Nunca pongas la clave `service_role` en ningún archivo servido al navegador.

Los registros creados por la versión anterior en `localStorage` no se importan automáticamente ni se borran: quedan en el navegador anterior, pero la nueva billetera Supabase inicia vacía. Registra de nuevo los datos que necesites compartir.

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/) y espera a que la base de datos termine de inicializarse.
2. En **SQL Editor**, ejecuta el contenido de `supabase/schema.sql`.
3. En **Project Settings → API**, copia la URL del proyecto y la clave publicable (o la clave `anon` heredada).
4. Pega esos valores en `supabase-config.example.js`:

   ```js
   export const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   export const SUPABASE_ANON_KEY = "TU-CLAVE-PUBLICABLE";
   ```

   La clave publicable está diseñada para estar en el navegador; las políticas RLS del esquema protegen la información. No publiques una clave `service_role`.

## 2. Configurar enlaces mágicos y correo

En **Authentication → URL Configuration**, agrega a **Redirect URLs** la URL donde se servirá la app, incluyendo el origen local `http://localhost:8000/**` durante desarrollo. Configura también **Site URL** con la URL de producción.

En **Authentication → SMTP Settings**, configura un proveedor SMTP real para que Supabase pueda enviar enlaces mágicos e invitaciones. La entrega de correo del servicio por defecto puede tener límites y no se recomienda para producción.

## 3. Desplegar las Edge Functions

Instala y autentica Supabase CLI, enlaza el proyecto y despliega las dos funciones desde la carpeta raíz:

```powershell
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy invite-member
supabase functions deploy accept-invitation
supabase secrets set APP_URL=https://tu-dominio.example
```

Para desarrollo local, usa `http://localhost:8000` como `APP_URL` y permite ese origen en las URL de redirección de Auth. Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a las Edge Functions; no copies el secreto `service_role` al frontend.

`invite-member` comprueba la membresía y que la billetera tenga cupo, registra la invitación y solicita a Supabase Auth el envío del enlace al correo invitado. Tras acceder con ese correo, `accept-invitation` valida que exista una invitación pendiente antes de incorporar a la persona como segundo miembro.

## 4. Servir la app localmente

No abras `index.html` directamente con `file://`: los módulos JavaScript y el inicio de sesión requieren un origen HTTP. Desde la carpeta del proyecto, inicia un servidor estático:

```powershell
py -m http.server 8000
```

Abre `http://localhost:8000`. La app seguirá mostrando la configuración pendiente mientras `supabase-config.example.js`, el esquema o las funciones no estén listos.

## Modelo de saldo

El saldo disponible es ingresos menos gastos menos fondos asignados a metas. Los gastos y aportes se validan de manera transaccional en PostgreSQL para evitar que dos operaciones simultáneas consuman el mismo saldo.
