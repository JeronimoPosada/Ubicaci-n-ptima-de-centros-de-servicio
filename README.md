# Red de Cobertura · Valle de Aburrá

![Status](https://img.shields.io/badge/status-active-success)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-tested-339933?logo=node.js&logoColor=white)
![Map](https://img.shields.io/badge/visualization-interactive-00B8D9)
![Academic](https://img.shields.io/badge/research-academic-7C4DFF)

Laboratorio interactivo para analizar la ubicación óptima de centros de servicio y la asignación de tráfico en el Área Metropolitana del Valle de Aburrá. El proyecto combina optimización no lineal, restricciones geográficas y programación lineal para estudiar cómo cambian las decisiones de localización cuando se modifican costos, capacidad, demanda y condiciones del entorno.

## Índice

- [Resumen ejecutivo](#resumen-ejecutivo)
- [Objetivo del proyecto](#objetivo-del-proyecto)
- [Características principales](#características-principales)
- [Modelo matemático](#modelo-matemático)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos y configuración](#requisitos-y-configuración)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Uso de la aplicación](#uso-de-la-aplicación)
- [Pruebas y validación](#pruebas-y-validación)
- [Tecnologías](#tecnologías)
- [Limitaciones y alcance](#limitaciones-y-alcance)

## Resumen ejecutivo

Este proyecto desarrolla un entorno de análisis para redes de cobertura y logística territorial. La aplicación permite evaluar el comportamiento de una red de servicio cuando se alteran variables clave como:

- número de centros de servicio,
- demanda por zona,
- intensidad de tráfico,
- capacidad instalada,
- restricciones geográficas,
- tarifa de transporte,
- métrica de costo.

La interfaz gráfica se construye con JavaScript puro y presenta un mapa interactivo del Valle de Aburrá donde se visualizan nodos, centros, regiones factibles, costos, flujos y soluciones comparadas entre métodos.

El sistema está orientado a análisis académico y de sensibilidad; no reemplaza la toma de decisiones operativas reales sobre redes existentes.

## Objetivo del proyecto

El proyecto responde a la siguiente pregunta de diseño:

> ¿Dónde deben ubicarse los centros de servicio para minimizar el costo total de atender la demanda, considerando restricciones físicas, geográficas y de capacidad?

Para ello, el problema se aborda en tres etapas complementarias:

1. Optimización sin restricciones.
2. Optimización con restricción geográfica mediante condiciones KKT.
3. Asignación de tráfico como problema de transporte con programación lineal.

## Características principales

- Visualización geográfica interactiva del Valle de Aburrá.
- Ajuste dinámico del número de centros de servicio.
- Cambios de demanda e intensidad de tráfico en tiempo real.
- Comparación de escenarios con distinta capacidad y costo.
- Región factible configurable con desplazamiento visual sobre el mapa.
- Evaluación del impacto de restricciones geográficas sobre la solución.
- Cálculo de flujos de transporte y comparación con una política de referencia.
- Superficie de costo y capas analíticas para interpretar la solución.
- Análisis de sensibilidad y validación matemática de resultados.

## Modelo matemático

### Etapa 1: optimización sin restricciones

Se define una función objetivo de tipo cuadrático ponderado:

$$
f(x,y)=\sum_{i=1}^{n} w_i\left[(x-x_i)^2+(y-y_i)^2\right]
$$

donde:

- $w_i$ representa el peso asociado a cada nodo o zona,
- $(x_i, y_i)$ son las coordenadas de cada punto de demanda,
- el punto óptimo sin restricciones coincide con el centroide ponderado.

La solución se obtiene en forma cerrada y se valida la positividad de la Hessiana para comprobar que el punto crítico corresponde a un mínimo global.

### Etapa 2: restricción geográfica

Se incorpora una región factible definida por una restricción del tipo:

$$
g(x,y) \le 0
$$

Los tipos soportados incluyen:

- disco,
- semiplano,
- extensión a múltiples centros.

La solución se resuelve con condiciones de Kuhn-Tucker (KKT), reportando el multiplicador $\lambda^*$, la holgura complementaria y la sensibilidad respecto a la restricción.

### Etapa 3: programación lineal de transporte

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

## Estructura del repositorio

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

### Componentes principales

- `app/index.html`: interfaz principal de la aplicación.
- `app/assets/js/app.js`: orquestación del estado y recálculo del modelo.
- `app/assets/js/optimizer.js`: etapas 1 y 2 del problema de optimización.
- `app/assets/js/transport.js`: etapa 3, transporte y costos reducidos.
- `app/assets/js/data.js`: datos geográficos y de demanda del escenario.
- `app/assets/js/ui.js`: controles, paneles e interacción visual.
- `tests/*.mjs`: validación automática del comportamiento del optimizador y del transporte.

## Requisitos y configuración

### Requisitos mínimos

- Python 3
- Navegador moderno: Chrome, Edge o Firefox
- Node.js para ejecutar las pruebas automatizadas

### Dependencias

El proyecto es principalmente de frontend estático, con validación en Node.js y un servidor local sencillo para ejecutar la aplicación.

## Instalación y ejecución

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

Luego abra en el navegador:

```text
http://localhost:8777/
```

## Uso de la aplicación

1. Ajuste el número de centros de servicio.
2. Modifique la intensidad de demanda.
3. Active o desactive la región factible.
4. Cambie el radio o la orientación de la restricción.
5. Revise la solución de la etapa 1 y la etapa 2 en el mapa.
6. Configure la holgura de capacidad y la tarifa de transporte.
7. Explore la solución de asignación de la etapa 3.
8. Compare la solución lineal con la política de referencia del vecino más cercano.

La interfaz integra análisis matemático y renderización geográfica en un mismo laboratorio interactivo.

## Pruebas y validación

El proyecto incluye pruebas automatizadas para verificar el comportamiento del modelo.

### Ejecutar pruebas

```bash
node tests/test_optimizador.mjs
node tests/test_transporte.mjs
```

Estas pruebas validan:

- óptimos analíticos contra búsqueda numérica,
- condiciones KKT,
- multiplicador $\lambda$ y sensibilidad,
- algoritmo de Weiszfeld para cálculo de centro de servicio,
- factibilidad y optimalidad del problema de transporte,
- comparación con un oráculo independiente.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript vanilla |
| Renderizado visual | Canvas y capas geográficas |
| Servidor local | Python `http.server` |
| Validación | Node.js y pruebas automatizadas |
| Modelado | Optimización no lineal y programación lineal |

## Limitaciones y alcance

El proyecto se basa en un marco académico y de análisis comparativo. Sus principales limitaciones son:

- los datos de población y demanda son de referencia,
- el escenario es una simulación orientada a análisis, no un diseño operativo de red real,
- la solución multi-centro se aborda como una heurística local,
- las decisiones de colocación y flujo sirven para comparar metodologías, no para planificación infraestructural real.

## Alcance académico

Este proyecto se enmarca en una propuesta de optimización aplicada a redes de cobertura y logística geográfica, integrando:

- análisis estadístico,
- localización de instalaciones,
- restricciones de región factible,
- programación matemática,
- visualización interactiva,
- comparación entre modelos analíticos y heurísticos.

## Conclusión

La aplicación constituye un laboratorio didáctico para estudiar la relación entre localización óptima, capacidad, costos de transporte y restricciones geográficas en un contexto urbano realista. Su valor principal reside en la capacidad de visualizar directamente cómo cambian las soluciones cuando se modifican los parámetros del problema.

---

Desarrollado como proyecto académico de optimización aplicada, análisis de redes y visualización interactiva.
