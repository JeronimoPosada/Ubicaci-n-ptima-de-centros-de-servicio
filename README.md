# Red de Cobertura · Valle de Aburrá

Laboratorio interactivo para analizar la ubicación óptima de centros de servicio y la asignación de tráfico en el Área Metropolitana del Valle de Aburrá, combinando optimización no lineal y programación lineal.

## 1. Descripción general

Este proyecto desarrolla un modelo de localización y cobertura para una red de servicios sobre una zona geográfica realista. La aplicación permite explorar cómo cambia la solución óptima cuando se varían parámetros clave como:

- número de centros de servicio,
- demanda asociada a cada zona,
- intensidad de tráfico,
- capacidad instalada,
- restricciones geográficas,
- tarifa de transporte,
- métrica de costo.

La interfaz gráfica está construida en JavaScript puro y presenta un mapa interactivo del Valle de Aburrá donde se visualizan nodos, centros, regiones factibles, costos, flujos y soluciones comparadas entre métodos.

El sistema está orientado a fines académicos y de análisis de sensibilidad, no para tomar decisiones operativas sobre una red existente.

## 2. Objetivo del proyecto

El proyecto busca responder la siguiente pregunta de diseño:

> ¿Dónde deben ubicarse los centros de servicio para minimizar el costo total de atender la demanda, considerando restricciones físicas, geográficas y de capacidad?

Para ello, se modela el problema en tres etapas complementarias:

1. Optimización sin restricciones.
2. Optimización con restricción geográfica mediante KKT.
3. Asignación de tráfico como problema de transporte con programación lineal.

## 3. Modelo matemático

### 3.1 Etapa 1: optimización sin restricciones

Se define una función objetivo de tipo cuadrático ponderado:

$$
 f(x,y) = \sum_{i=1}^{n} w_i \left[(x-x_i)^2 + (y-y_i)^2\right]
$$

donde:

- $w_i$ representa el peso asociado a cada nodo o zona,
- $(x_i, y_i)$ son las coordenadas de cada punto de demanda,
- el óptimo sin restricciones coincide con el centroide ponderado.

La solución se obtiene en forma cerrada y se valida la positividad de la Hessiana para demostrar que el punto crítico es un mínimo global.

### 3.2 Etapa 2: restricción geográfica

Se incorpora una región factible definida por una restricción del tipo:

$$
 g(x,y) \le 0
$$

Los tipos soportados son:

- disco,
- semiplano,
- extensión a múltiples centros.

La solución se resuelve con condiciones de Kuhn-Tucker (KKT), reportando el multiplicador $\lambda^*$, la holgura complementaria y la sensibilidad respecto de la restricción.

### 3.3 Etapa 3: programación lineal de transporte

El problema de asignación se formula como:

$$
\min Z = \sum_i \sum_j c_{ij} t_{ij}
$$

sujeto a:

$$
\sum_j t_{ij} = d_i
$$

$$
\sum_i t_{ij} \le B_j
$$

$$
 t_{ij} \ge 0
$$

donde:

- $d_i$ es la demanda del nodo $i$,
- $B_j$ es la capacidad del centro $j$,
- $c_{ij}$ representa el costo de transporte entre el nodo y el centro,
- $t_{ij}$ es el flujo asignado.

La solución usa un esquema tipo transporte con Vogel + MODI para obtener una solución básica factible y luego mejorarla mediante costos reducidos.

## 4. Funcionalidades principales

- Visualización interactiva de nodos y zonas del Valle de Aburrá.
- Ajuste dinámico del número de centros de servicio.
- Cambio de demanda por intensidad de tráfico.
- Comparación de resultados para diferentes escenarios.
- Restricción de región factible con desplazamiento visual sobre el mapa.
- Evaluación del impacto de costos y capacidad.
- Cálculo de flujos de transporte y comparación con una política de referencia.
- Capa de superficie que representa la función objetivo.
- Cálculo de optimalidad y análisis de sensibilidad.

## 5. Estructura del repositorio

```text
.
├── app/
│   ├── index.html
│   └── assets/
│       ├── css/
│       └── js/
│           ├── app.js
│           ├── data.js
│           ├── field.js
│           ├── geo.js
│           ├── layers.js
│           ├── mapengine.js
│           ├── optimizer.js
│           ├── transport.js
│           └── ui.js
├── tests/
│   ├── test_optimizador.mjs
│   └── test_transporte.mjs
├── iniciar.sh
├── README.md
└── ...
```

### Componentes relevantes

- `app/index.html`: interfaz principal.
- `app/assets/js/app.js`: orquestación del estado y recálculo del modelo.
- `app/assets/js/optimizer.js`: etapas 1 y 2 del problema de optimización.
- `app/assets/js/transport.js`: etapa 3, transporte y costos reducidos.
- `app/assets/js/data.js`: datos geográficos y de demanda del escenario.
- `app/assets/js/ui.js`: controles, paneles y visualización.
- `tests/*.mjs`: validación matemática del comportamiento del optimizador.

## 6. Requisitos

- Python 3
- Navegador moderno (Chrome, Edge, Firefox)
- Node.js para ejecutar las pruebas automatizadas

## 7. Instalación y ejecución

### Opción recomendada

Desde la raíz del proyecto:

```bash
./iniciar.sh
```

Esto levanta un servidor local y abre la aplicación en el navegador, normalmente en:

```text
http://localhost:8777/
```

Si el puerto está ocupado, el script intenta reservar uno alternativo.

### Ejecución manual

```bash
cd app
python3 -m http.server 8777
```

Luego abrir en el navegador:

```text
http://localhost:8777/
```

## 8. Cómo usar la aplicación

1. Ajusta el número de centros de servicio.
2. Modifica la intensidad de demanda.
3. Activa o desactiva la región factible.
4. Cambia el radio o la orientación de la restricción.
5. Revisa la solución de la etapa 1 y la etapa 2 en el mapa.
6. Configura la holgura de capacidad y la tarifa de transporte.
7. Explora la solución de asignación en la etapa 3.
8. Compara la solución lineal con la política de referencia del vecino más cercano.

La interfaz ofrece una experiencia visual que integra análisis matemático y renderización geográfica en un mismo laboratorio.

## 9. Pruebas y validación

El proyecto incluye pruebas automatizadas para verificar los resultados del modelo.

### Ejecutar pruebas

```bash
node tests/test_optimizador.mjs
node tests/test_transporte.mjs
```

Estas pruebas validan:

- óptimos analíticos contra búsqueda numérica,
- condiciones KKT,
- multiplicador $\lambda$ y sensibilidad,
- Weiszfeld para cálculo de centro de servicio,
- factibilidad y optimalidad del problema de transporte,
- comparación con un oráculo independiente.

## 10. Supuestos y limitaciones

El proyecto se basa en un marco académico y de análisis comparativo. Entre sus limitaciones se destacan:

- los datos de población y demanda son de referencia,
- el escenario es una simulación de análisis y no un diseño de red real,
- la solución del problema multi-centro es una heurística local,
- las decisiones de colocación y flujo sirven para comparar metodologías, no para operación de infraestructura real.

## 11. Tecnologías

- HTML5
- CSS3
- JavaScript vanilla
- Canvas para renderizado geográfico y analítico
- Python para servidor local
- Validación matemática mediante pruebas en Node.js

## 12. Alcance académico

Este proyecto se enmarca en un enfoque de optimización aplicada a redes de cobertura y logística geográfica, integrando:

- análisis estadístico,
- localización de instalaciones,
- restricciones de región factible,
- programación matemática,
- visualización interactiva,
- comparación entre modelos analíticos y heurísticos.

## 13. Conclusión

La aplicación constituye un laboratorio didáctico para estudiar la relación entre localización óptima, capacidad, costos de transporte y restricciones geográficas en un contexto urbano realista. Su valor principal radica en la capacidad de visualizar directamente cómo cambian las soluciones cuando se modifican los parámetros del problema.

---

Desarrollado como proyecto de aula y análisis de optimización aplicada.
