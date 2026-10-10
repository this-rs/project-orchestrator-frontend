import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: 'Energía',
    description: 'Nivel de actividad reciente de un elemento. Cuanta más energía, más se está trabajando en él.',
  },
  cohesion: {
    label: 'Cohesión',
    description: 'Medida de la fuerza interna de un módulo o componente. Una cohesión alta significa que sus elementos están muy ligados entre sí.',
  },
  synapse: {
    label: 'Sinapsis',
    description: 'Conexión entre dos elementos del proyecto (notas, tareas, archivos). Representa una relación de dependencia o de contexto.',
  },
  scar: {
    label: 'Cicatriz',
    description: 'Huella que deja un problema pasado. Ayuda a no repetir los mismos errores al señalar las zonas frágiles.',
  },
  moat: {
    label: 'Foso',
    description: 'Barrera protectora alrededor de un componente crítico. Indica que los cambios ahí requieren un cuidado adicional.',
  },
  spreading_activation: {
    label: 'Propagación de activación',
    description: 'Mecanismo que propaga la importancia de un elemento a sus vecinos en el grafo, como una ola a través de una red.',
  },
  fabric: {
    label: 'Tejido',
    description: 'La red de conocimiento del proyecto: el conjunto de conexiones entre notas, decisiones y código.',
  },
  trajectory: {
    label: 'Trayectoria',
    description: 'Historial del camino que siguió un asistente o una tarea por las etapas del proyecto.',
  },
  protocol: {
    label: 'Protocolo',
    description: 'Máquina de estados finitos que describe un flujo de trabajo. Define las transiciones válidas entre estados.',
  },
  persona: {
    label: 'Persona',
    description: 'Perfil especializado asignado a un asistente para orientar su comportamiento y sus habilidades.',
  },
  episode: {
    label: 'Episodio',
    description: 'Sesión de trabajo registrada de un asistente, con las acciones realizadas y los resultados obtenidos.',
  },
  neural_routing: {
    label: 'Enrutamiento neuronal',
    description: 'Reparto inteligente de las tareas entre asistentes, según sus habilidades y su carga de trabajo.',
  },
  milestone: {
    label: 'Objetivo',
    description: 'Punto de control importante del proyecto. Agrupa tareas y marca una etapa clave del progreso.',
  },
  feature_graph: {
    label: 'Grafo de funcionalidades',
    description: 'Visualización de las dependencias entre las funcionalidades del proyecto, que muestra cuáles dependen de cuáles.',
  },
  lifecycle_hook: {
    label: 'Gancho de ciclo de vida',
    description: 'Acción automática activada por un cambio de estado (p. ej. una notificación cuando una tarea pasa a «completed»).',
  },
  constraint: {
    label: 'Restricción',
    description: 'Regla o limitación que se aplica a una tarea o a un plan. Debe respetarse para que el trabajo se considere válido.',
  },
  decision: {
    label: 'Decisión',
    description: 'Elección arquitectónica o técnica registrada con su contexto y su justificación, para consultarla en el futuro.',
  },
  component: {
    label: 'Componente',
    description: 'Módulo funcional del proyecto (backend, frontend, API…) que sirve para organizar el código y las responsabilidades.',
  },
  workspace: {
    label: 'Espacio de trabajo',
    description: 'Contenedor aislado que agrupa proyectos, tareas y recursos. Mantiene separados los distintos contextos de trabajo.',
  },
  skill: {
    label: 'Habilidad',
    description: 'Capacidad registrada de un asistente, que describe lo que sabe hacer y con qué nivel de dominio.',
  },
  release: {
    label: 'Versión publicada',
    description: 'Versión publicada del proyecto, que agrupa un conjunto de cambios listos para producción.',
  },
  success_rate: {
    label: 'Tasa de éxito',
    description: 'Porcentaje de tareas completadas con éxito por esta persona. Refleja su fiabilidad en las misiones asignadas.',
  },
  activation_count: {
    label: 'Activaciones',
    description: 'Número de veces que se activó un elemento (usado por un asistente). Cuanto mayor es, más se recurre al elemento.',
  },
  analysis_profile: {
    label: 'Perfil de análisis',
    description: 'Configuración que define cómo analizar un proyecto: qué métricas calcular y qué umbrales aplicar.',
  },
  co_change: {
    label: 'Cambio conjunto',
    description: 'Archivos que cambian a menudo a la vez. Un cambio conjunto frecuente sugiere acoplamiento (intencionado o accidental).',
  },
  coupling: {
    label: 'Acoplamiento',
    description: 'Grado de dependencia entre dos módulos. Es preferible un acoplamiento bajo para facilitar el mantenimiento.',
  },
  churn: {
    label: 'Rotación de cambios',
    description: 'Con qué frecuencia se modifica un archivo. Una rotación alta puede indicar una zona inestable o en desarrollo activo.',
  },
  hotspot: {
    label: 'Punto caliente',
    description: 'Archivo complejo que se modifica con frecuencia. Los puntos calientes son zonas que vigilar porque concentran el riesgo de errores.',
  },
  orphan: {
    label: 'Archivo huérfano',
    description: 'Archivo que no es importado ni exportado por otros archivos. Puede indicar código muerto o un archivo mal integrado.',
  },
  dead_note: {
    label: 'Nota muerta',
    description: 'Nota sin energía residual: hace mucho que no se lee ni se modifica y probablemente está obsoleta.',
  },
  stale_note: {
    label: 'Nota desactualizada',
    description: 'Nota cuyo contenido no se actualiza desde hace tiempo y que quizá ya no refleje el estado actual del proyecto.',
  },
  god_function: {
    label: 'Función todopoderosa',
    description: 'Función excesivamente larga o compleja que hace demasiadas cosas. Conviene dividirla en funciones más pequeñas.',
  },
  clustering_coefficient: {
    label: 'Coeficiente de agrupamiento',
    description: 'Mide la densidad de conexiones entre los vecinos de un nodo. Un coeficiente alto indica un grupo estrechamente interconectado.',
  },
  knowledge_coverage: {
    label: 'Cobertura de conocimiento',
    description: 'Relación entre el número de notas y decisiones y el número de archivos de código. Indica si el código está bien documentado.',
  },
  note_freshness: {
    label: 'Frescura de las notas',
    description: 'Proporción de notas que siguen al día. Una tasa baja significa que muchas notas necesitan una relectura.',
  },
  synapse_quality: {
    label: 'Calidad de las sinapsis',
    description: 'Proporción de conexiones sólidas en la red. Las sinapsis débiles son vínculos poco fiables entre elementos.',
  },
  skills_maturity: {
    label: 'Madurez de las habilidades',
    description: 'Relación entre las habilidades activas y el total. Indica el nivel general de dominio del equipo sobre el proyecto.',
  },
  code_safety: {
    label: 'Seguridad del código',
    description: 'Puntuación basada en la evaluación de riesgos. Tiene en cuenta los archivos de riesgo crítico y alto y las vulnerabilidades.',
  },
  health_score: {
    label: 'Puntuación de salud',
    description: 'Puntuación global que combina la cobertura de conocimiento, la frescura de las notas, la energía neuronal, la calidad de las sinapsis y la madurez de las habilidades.',
  },
  circular_dependency: {
    label: 'Dependencia circular',
    description: 'Situación en la que dos módulos dependen el uno del otro y forman un bucle. Hace el código más difícil de mantener y de probar.',
  },
} satisfies Translation<'glossary'>
