# OBD2 HUD Live Dashboard & Copiloto IA

PWA de telemetría OBD-II para una pantalla horizontal dentro del vehículo. El proyecto incluye una simulación local, conexión a adaptadores ELM327 BLE mediante Web Bluetooth, alertas visuales y por voz, y un copiloto IA opcional.

## Uso

- Al abrir la aplicación, la simulación está activa. Los escenarios Ralentí, Crucero, Deportivo y Sobrecalentar solo aparecen mientras la simulación está activa.
- Pulsa **Sim** para pausar o reanudar la simulación. Los escenarios se ocultan al pausarla.
- Para usar un vehículo real, selecciona su perfil y pulsa **Conectar BT**. Al conectar el scanner, la simulación se detiene y se ocultan los escenarios. Desconecta el scanner antes de volver a activar la simulación.
- Las lecturas OBD reales requieren un navegador compatible con Web Bluetooth, como Chrome o Edge en Android, conexión HTTPS y un adaptador BLE. Web Bluetooth no admite adaptadores Bluetooth clásico (SPP/RFCOMM); iOS requiere un navegador compatible con Web Bluetooth.

La consola muestra el protocolo que negoció el ELM327. Si aparece `UNABLE TO CONNECT`, revisa el encendido del vehículo y la compatibilidad del adaptador; la aplicación ahora informa el error y no marca la conexión como lista para telemetría.

## PIDs y telemetría

Los PIDs estándar usados son RPM (`010C`), velocidad (`010D`), posición del acelerador (`0111`), presión del múltiple (`010B`), refrigerante (`0105`) y voltaje del módulo (`0142`). La temperatura TCM usa PIDs específicos del perfil y puede no estar disponible en todos los vehículos. Los perfiles de fabricante son puntos de partida: confirma sus PIDs y encabezados CAN para tu año/modelo antes de confiar en lecturas de ECU específicas.

El tablero y las alertas se actualizan con lecturas del scanner o con datos simulados. Los umbrales se pueden ajustar en **Umbrales**.

## Copiloto y despliegue

La función serverless `/api/copilot` soporta Gemini (`GEMINI_API_KEY`) y OpenAI (`OPENAI_API_KEY`). Configura las claves como variables de entorno en Vercel. Para un dominio propio, configura también `APP_ORIGIN` con el origen completo, por ejemplo `https://obd2.example.com`. La aplicación usa `gemini-2.0-flash` y `gpt-4o-mini` actualmente.

Ejecuta `vercel dev` para desarrollo local. El proyecto está configurado para desplegarse en Vercel.
