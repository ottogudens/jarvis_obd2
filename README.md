# OBD2 HUD Live Dashboard & Copiloto IA

PWA de telemetría OBD-II para una pantalla horizontal dentro del vehículo. Incluye simulación local, conexión a adaptadores ELM327 BLE mediante Web Bluetooth, alertas visuales y por voz, y un copiloto IA opcional.

## Uso

- Al abrir la aplicación, la simulación está activa. Los escenarios Ralentí, Crucero, Deportivo y Sobrecalentar solo aparecen mientras la simulación está activa.
- Pulsa **Sim** para pausar o reanudar la simulación. Los escenarios se ocultan al pausarla.
- Completa **Agregar vehículo** para guardar la identificación del vehículo en el navegador. El VIN se puede decodificar manualmente con el servicio público vPIC de NHTSA; el VIN no se envía al copiloto.
- Para usar un vehículo real, pulsa **Conectar BT**. El escáner detiene la simulación y negocia el protocolo automáticamente. Desconéctalo antes de reanudar la simulación.
- Las lecturas reales requieren un navegador compatible con Web Bluetooth, como Chrome o Edge en Android, conexión HTTPS y un adaptador BLE. Web Bluetooth no admite adaptadores Bluetooth clásico (SPP/RFCOMM).

## Descubrimiento de señales OBD

Al conectar, el ELM327 consulta los mapas de PIDs admitidos por la ECU (`01 00`, `01 20` y páginas siguientes). El tablero sondea los PIDs estándar anunciados por el módulo y la consola indica cuántos encontró. Si una señal no aparece, la ECU puede no anunciar ese PID o el adaptador puede no recibir respuesta; la consola registra ambos casos.

El tablero tiene decodificadores genéricos para RPM (`010C`), velocidad (`010D`), acelerador (`0111`), refrigerante (`0105`), presión de admisión (`010B`), voltaje del módulo (`0142`), estado del combustible y ajustes STFT/LTFT (`0103`, `0106`, `0107`), temperatura de aceite (`015C`) y MIL/cantidad de DTC (`0101`). El vehículo debe anunciar el PID para que la aplicación lo consulte.

La ficha de marca/modelo/año y motor sirve para identificar el vehículo y preparar una futura tabla OEM. Por sí sola no proporciona los PIDs propietarios de transmisión, aceite u otros módulos. Esos identificadores y sus fórmulas deben estar documentados para el modelo, año, motor y ECU exactos; la aplicación no inventa ni consulta valores OEM no verificados. La presión de aceite tampoco tiene un PID genérico universal.

## Copiloto y despliegue

La función serverless `/api/copilot` soporta Gemini (`GEMINI_API_KEY`) y OpenAI (`OPENAI_API_KEY`). Configura las claves como variables de entorno en Vercel. Para un dominio propio, configura también `APP_ORIGIN` con el origen completo. Ejecuta `vercel dev` para desarrollo local.
