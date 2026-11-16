# Motor de Telemetría Serverless con Netlify Blobs

API RESTful construida con Express y `serverless-http` sobre Netlify Functions, utilizando **Netlify Blobs** como almacén distribuido clave-valor para capturar y analizar métricas de conversión en tiempo real.

## Respuestas Teóricas de Reflexión Arquitectónica

### 1. Persistencia vs. Estado Efímero
Las funciones serverless destruyen su memoria RAM tras finalizar su ejecución, haciendo imposible guardar datos en variables globales. **Netlify Blobs** resuelve esto desacoplando el almacenamiento de la capa de cómputo mediante un servicio distribuido externo accesible vía red. A diferencia de una base de datos relacional (SQL) que exige esquemas rígidos, migraciones y gestión compleja de pools de conexiones (que suelen saturarse ante picos de tráfico serverless), un almacén **Clave-Valor/Objeto** permite guardar documentos JSON semiestructurados de forma inmediata, sin fricción de esquema y escalando automáticamente.

### 2. Consistencia Fuerte vs. Consistencia Eventual
* **Consistencia Eventual:** Garantiza que, tras escribir un dato, todas las réplicas del sistema convergerán al mismo valor eventualmente, pero lecturas inmediatas pueden devolver datos desactualizados por unos milisegundos.
* **Consistencia Fuerte (`consistency: 'strong'`):** Garantiza que cualquier lectura posterior a una escritura devolverá inmediatamente el dato más reciente. Si usáramos consistencia eventual en nuestro panel bajo alto tráfico durante el Demo Day, al registrar un evento y recargar el dashboard al instante, los contadores (`totalEvents`) aparecerían incompletos o retrasados respecto a las acciones reales.

### 3. Garantía de Envío en Frontend (`keepalive` y `navigator.sendBeacon`)
Cuando un usuario hace clic en un enlace externo, el navegador cancela inmediatamente cualquier petición HTTP pendiente (`fetch` tradicional) para liberar recursos y cargar la nueva página, perdiendo la métrica. Tanto la bandera `keepalive: true` en `fetch()` como la API `navigator.sendBeacon()` delegan la petición al proceso en segundo plano del navegador, garantizando que los datos terminen de transmitirse al servidor incluso después de que la pestaña o página original se haya cerrado.

### 4. Particionamiento y Escalabilidad de Claves
Ejecutar `store.list()` seguido de 100,000 llamadas paralelas con `Promise.all()` provocaría un cuello de botella grave: saturación de memoria RAM, tiempos de espera excedidos (Timeout de 10s en AWS Lambda) y altos costos por operaciones de lectura. En producción se mitiga mediante:
1. **Prefijos jerárquicos** en las claves (ej. `2026-11-15/tofu/metric_...`) para listar solo un día o categoría específica.
2. **Paginación** por lotes usando cursores.
3. **Contadores pre-agregados** o procesamiento asíncrono hacia un almacén analítico.

### 5. Higiene de Datos y Prevención de Spam
Un endpoint público `POST /api/metrics` queda expuesto a bots o usuarios maliciosos que envíen millones de peticiones falsas (saturando la cuota de almacenamiento) o inyecten datos basura que arruinen las estadísticas. Para protegerlo se implementan tres capas:
* **CORS estricto:** Restringir el acceso únicamente al dominio oficial de nuestra landing page.
* **Validación de esquema (Zod/Joi):** Rechazar cualquier petición que no cumpla exactamente con los tipos de datos, longitudes máximas y valores permitidos (`enum` para `step`).
* **Rate Limiting:** Limitar la cantidad máxima de peticiones por minuto permitidas desde una misma dirección IP.

## Evidencias de Funcionamiento
