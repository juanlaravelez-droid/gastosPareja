# Arquitectura

La aplicación usa JavaScript estándar y módulos ES, sin framework ni proceso de
compilación. La separación está aplicada de forma incremental:

```text
src/
  application/
    expense-service.js        # Alta, eliminación y reparto neto de gastos
    wallet-service.js          # Resúmenes, saldos y cálculos para la billetera
    wallet-validation.js       # Validaciones para operaciones de la billetera
    goal-cover.js              # Validación y optimización de portadas de metas
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

Las portadas compartidas se comprimen en el navegador y se guardan en el bucket
privado `goal-covers`. La meta conserva la ruta del archivo; Supabase Storage
emite URLs firmadas solo para integrantes de la billetera. La migración
`20261111000000_add_shared_goal_covers.sql` configura el bucket, sus políticas y
la RPC que vincula o quita la portada de una meta.

`getDashboardSummary` presenta el fondo común del mes a partir de los aportes,
gastos y transferencias a metas del periodo, además de las aportaciones por
integrante y la proyección de gastos. Las transferencias usan el registro
compartido de aportes a metas y se muestran en Movimientos. Los gastos se
descuentan del fondo común y su borrado pasa por una función autorizada para
miembros de la billetera.

Las operaciones de saldo, gastos y metas que afectan a datos compartidos deben
seguir protegidas por las funciones y políticas de Supabase. Las validaciones
del navegador mejoran la experiencia, pero no sustituyen la validación del
servidor.

## Pruebas

Ejecuta `npm test` para correr las pruebas unitarias de dominio, validación,
almacenamiento local y repositorio. No se requieren dependencias externas de
pruebas. GitHub Actions ejecuta la misma suite en cada push a `main` y en cada
pull request dirigido a `main`.
