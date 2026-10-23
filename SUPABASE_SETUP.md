# Configurar la billetera compartida

La app usa Supabase para las cuentas, los datos compartidos y las invitaciones. Para iniciar, se necesita una cuenta y un proyecto Supabase. La configuración del cliente se lee desde `supabase-config.example.js`; la URL y la clave publicable (anon) no son secretos y pueden estar en el repositorio. Nunca pongas la clave `service_role` en ningún archivo servido al navegador.

Los registros creados por la versión anterior en `localStorage` no se importan automáticamente ni se borran: quedan en el navegador anterior, pero la nueva billetera Supabase inicia vacía. Registra de nuevo los datos que necesites compartir.

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/) y espera a que la base de datos termine de inicializarse.
2. En **SQL Editor**, ejecuta el contenido de `supabase/schema.sql`.
   Si el esquema ya estaba instalado, ejecuta también `supabase/migrations/20261023000000_allow_income_author_selection.sql` para permitir atribuir el ingreso a cualquiera de los integrantes y conservar quién lo registró.
3. En **Project Settings → API**, copia la URL del proyecto y la clave publicable (o la clave `anon` heredada).
4. Pega esos valores en `supabase-config.example.js`:

   ```js
   export const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   export const SUPABASE_ANON_KEY = "TU-CLAVE-PUBLICABLE";
   ```

   La clave publicable está diseñada para estar en el navegador; las políticas RLS del esquema protegen la información. No publiques una clave `service_role`.

## 2. Configurar enlaces mágicos y correo

En **Authentication → URL Configuration**, agrega a **Redirect URLs** la URL donde se servirá la app, incluyendo el origen local `http://localhost:8000/**` durante desarrollo. Configura también **Site URL** con la URL de producción.

En **Authentication → SMTP Settings**, configura un proveedor SMTP real para que Supabase pueda enviar enlaces mágicos e invitaciones. El proveedor de correo integrado está limitado a 2 correos por hora para todo el proyecto; además, por defecto hay una espera de 60 segundos entre solicitudes de enlace para el mismo usuario. Con SMTP propio, puedes ajustar los límites disponibles en **Authentication → Rate Limits**. Los cambios se hacen en el panel del proyecto Supabase, no en el código de la app. Si aparece `email rate limit exceeded`, espera al menos un minuto y vuelve a probar; para quitar el límite bajo del proveedor integrado, configura SMTP propio y ajusta el límite de envío en esa sección.

## 3. Desplegar las Edge Functions

El endpoint de invitación debe estar desplegado en el mismo proyecto Supabase que aparece en `supabase-config.example.js`. Si la consola del navegador informa CORS o `Failed to send a request to the Edge Function`, comprueba primero en **Supabase → Edge Functions** que `invite-member` esté desplegada: un `404` en `/functions/v1/invite-member` significa que la función aún no existe en ese proyecto; no es un problema que se resuelva cambiando el formulario o los encabezados CORS.

Instala/autentica Supabase CLI, enlaza el proyecto correcto y despliega las dos funciones desde la carpeta raíz:

```powershell
supabase login
supabase link --project-ref kgligqwuhvkhddjftdmc
supabase functions deploy invite-member --project-ref kgligqwuhvkhddjftdmc
supabase functions deploy accept-invitation --project-ref kgligqwuhvkhddjftdmc
supabase secrets set APP_URL=https://juanlaravelez-droid.github.io/gastosPareja/ --project-ref kgligqwuhvkhddjftdmc
```

El secreto `APP_URL` debe apuntar a la aplicación desplegada; para pruebas locales, configura temporalmente `http://localhost:8000` y vuelve a cambiarlo al publicar. Agrega la URL de GitHub Pages y los orígenes locales usados en **Authentication → URL Configuration → Redirect URLs**. Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a las Edge Functions; no copies el secreto `service_role` al frontend.

`invite-member` comprueba la membresía y que la billetera tenga cupo, registra la invitación y solicita a Supabase Auth el envío del enlace al correo invitado. Tras acceder con ese correo, `accept-invitation` valida que exista una invitación pendiente antes de incorporar a la persona como segundo miembro.

## 4. Servir la app localmente

No abras `index.html` directamente con `file://`: los módulos JavaScript y el inicio de sesión requieren un origen HTTP. Desde la carpeta del proyecto, inicia un servidor estático:

```powershell
py -m http.server 8000
```

Abre `http://localhost:8000`. La app seguirá mostrando la configuración pendiente mientras `supabase-config.example.js`, el esquema o las funciones no estén listos.

## Demo local

En la pantalla de acceso o de configuración pendiente, selecciona **Probar demo local** para explorar la billetera sin enviar correos. La demo usa datos de ejemplo y guarda los cambios en el almacenamiento local de ese navegador; no crea una cuenta ni sincroniza datos con Supabase o con otra persona. Usa **Salir de demo** para volver al acceso normal. Los datos de ejemplo se conservan en ese navegador para la siguiente sesión de demo.

## Modelo de saldo

El saldo disponible es ingresos menos gastos menos fondos asignados a metas. Los gastos y aportes se validan de manera transaccional en PostgreSQL para evitar que dos operaciones simultáneas consuman el mismo saldo.
