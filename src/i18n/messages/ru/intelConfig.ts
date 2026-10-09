import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Код', description: 'Файлы, функции, структуры, трейты' },
    pm: { label: 'Проект', description: 'Планы, задачи, цели' },
    knowledge: { label: 'Знания', description: 'Заметки, решения, ограничения' },
    fabric: { label: 'Ткань', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Нейросеть', description: 'Синапсы, энергия, активация' },
    skills: { label: 'Навыки', description: 'Возникающие кластеры знаний' },
    behavioral: { label: 'Поведение', description: 'Протоколы, состояния, переходы (FSM)' },
    chat: { label: 'Чат', description: 'Сеансы чата и обсуждаемые сущности' },
  },
  preset: {
    code_only: { label: 'Код', description: 'Чистая архитектура кода' },
    knowledge_overlay: { label: 'Знания', description: 'Заметки и решения поверх кода' },
    neural_view: { label: 'Нейросеть', description: 'Нейросеть, навыки и протоколы' },
    pm_view: { label: 'Проект', description: 'Планы, задачи, цели' },
    impact_mode: { label: 'Влияние', description: 'Анализ влияния' },
    behavioral_view: { label: 'Поведение', description: 'Протоколы, навыки, заметки и их связи' },
    full_stack: { label: 'Полный', description: 'Все слои' },
  },
  group: {
    core: 'Основа',
    code: 'Код',
    knowledge: 'Знания',
    git: 'Git',
    sessions: 'Сеансы',
    features: 'Функциональности',
    behavioral: 'Поведение',
  },
  scale: { workspace: 'проекты', project: 'планы + цели', plan: 'задачи', task: 'шаги' },
} satisfies Translation<'intelConfig'>
