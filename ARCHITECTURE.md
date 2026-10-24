# Arquitectura

La aplicación usa JavaScript estándar y módulos ES, sin framework ni proceso de
compilación. La separación está aplicada de forma incremental:

```text
src/
  application/
    wallet-validation.js       # Validaciones para operaciones de la billetera
  domain/
    finance.js                 # Cálculos y reglas financieras puras
  infrastructure/
    demo-storage.js            # Persistencia y reconstrucción de la demo
    supabase-repository.js     # Consultas, RPC y autenticación de Supabase
  presentation/
    render.js                  # Renderizado del dashboard
    ui.js                      # Temas, mensajes, vistas y tips
app.js                         # Controlador de formularios y composición
```

`app.js` conserva el estado de pantalla y conecta eventos, validaciones,
repositorios y renderizado. Las consultas de Supabase, las reglas financieras,
la persistencia de demo y el renderizado ya están separados, lo cual permite
probarlos sin iniciar la interfaz completa.

Las operaciones de saldo, gastos y metas que afectan a datos compartidos deben
seguir protegidas por las funciones y políticas de Supabase. Las validaciones
del navegador mejoran la experiencia, pero no sustituyen la validación del
servidor.

## Pruebas

Ejecuta `npm test` para correr las pruebas unitarias de dominio, validación,
almacenamiento local y repositorio. No se requieren dependencias externas de
pruebas.
