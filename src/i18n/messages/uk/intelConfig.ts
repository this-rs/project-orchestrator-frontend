import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Код', description: 'Файли, функції, структури, трейти' },
    pm: { label: 'Проєкт', description: 'Плани, завдання, цілі' },
    knowledge: { label: 'Знання', description: 'Нотатки, рішення, обмеження' },
    fabric: { label: 'Тканина', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Нейронний', description: 'Синапси, енергія, активація' },
    skills: { label: 'Навички', description: 'Знання, що виникають самі' },
    behavioral: { label: 'Поведінковий', description: 'Протоколи, стани, переходи (FSM)' },
    chat: { label: 'Чат', description: 'Сесії чату та обговорювані сутності' },
  },
  preset: {
    code_only: { label: 'Код', description: 'Чиста архітектура коду' },
    knowledge_overlay: { label: 'Знання', description: 'Нотатки й рішення поверх коду' },
    neural_view: { label: 'Нейронний', description: 'Нейронна мережа, навички й протоколи' },
    pm_view: { label: 'Проєкт', description: 'Плани, завдання, цілі' },
    impact_mode: { label: 'Вплив', description: 'Аналіз впливу' },
    behavioral_view: { label: 'Поведінковий', description: 'Протоколи, навички, нотатки та їхні зв\'язки' },
    full_stack: { label: 'Повний', description: 'Усі шари' },
  },
  group: {
    core: 'Основа',
    code: 'Код',
    knowledge: 'Знання',
    git: 'Git',
    sessions: 'Сесії',
    features: 'Можливості',
    behavioral: 'Поведінка',
  },
  scale: { workspace: 'проєкти', project: 'плани + цілі', plan: 'завдання', task: 'кроки' },
} satisfies Translation<'intelConfig'>
