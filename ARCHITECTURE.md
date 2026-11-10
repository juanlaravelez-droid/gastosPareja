# Arquitectura

La aplicación usa JavaScript estándar y módulos ES, sin framework ni proceso de
compilación. La separación está aplicada de forma incremental:

```text
src/
  application/
    expense-service.js        # Alta, eliminación y reparto neto de gastos
    wallet-service.js          # Resúmenes, saldos y cálculos para la billetera
    wallet-validation.js       # Validaciones para operaciones de la billetera
  domain/
    finance.js                 # Cálculos y reglas financieras puras
  infrastructure/
    demo-storage.js            # Persistencia y reconstrucción de la demo
    storage-repository.js      # Única capa que accede al almacenamiento del navegador
    supabase-repository.js     # Consultas, RPC y autenticación de Supabase
  presentation/
    render.js                  # Renderizado del dashboard
    navigation.js              # Pestañas, historial y modal de movimientos
    views/
      DashboardView.js         # Métricas, privacidad y acciones del dashboard
    ui.js                      # Temas, mensajes, vistas y tips
app.js                         # Controlador de formularios y composición
button-catalog.html            # Ejemplos interactivos del sistema de botones
```

`app.js` conserva el estado de pantalla y conecta eventos, validaciones,
servicios, repositorios y renderizado. Los servicios operan sobre datos puros;
la presentación recibe sus resultados para actualizar la interfaz. El acceso a
`localStorage` se encapsula en `storage-repository.js`, y la persistencia de la
demo y de Supabase se mantiene detrás de sus respectivos repositorios.

`calculateExpenseSplit` divide cada gasto entre los integrantes en centavos,
distribuye cualquier centavo sobrante de manera determinista y devuelve lo
pagado, lo que corresponde y el saldo neto por persona. `getDashboardSummary`
calcula las métricas mensuales y la proyección desde esos datos; las liquidaciones
se guardan en la demo o en Supabase y reducen el saldo pendiente. Solo quien
realiza el pago puede registrar una liquidación en Supabase. El borrado de gastos
también pasa por una función autorizada para miembros de la billetera.

Las operaciones de saldo, gastos y metas que afectan a datos compartidos deben
seguir protegidas por las funciones y políticas de Supabase. Las validaciones
del navegador mejoran la experiencia, pero no sustituyen la validación del
servidor.

## Pruebas

Ejecuta `npm test` para correr las pruebas unitarias de dominio, validación,
almacenamiento local y repositorio. No se requieren dependencias externas de
pruebas. GitHub Actions ejecuta la misma suite en cada push a `main` y en cada
pull request dirigido a `main`.
