// ============================================================================
// TriggerBuilder — Visual editor for ContextVector relevance dimensions
// ============================================================================

import { memo, useCallback } from 'react'
import {
  Gauge,
  Layers,
  Globe,
  HardDrive,
  RotateCcw,
} from 'lucide-react'
import type { RelevanceVector } from '@/types/intelligence'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/catalog'

// ============================================================================
// DIMENSION CONFIG
// ============================================================================

interface DimensionConfig {
  key: keyof RelevanceVector
  label: MessageKey
  icon: typeof Gauge
  color: string
  /** The five marks under the slider; an empty one is left blank. */
  labels: (MessageKey | '')[]
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: 'phase',
    label: 'composer.trigger.phase.label',
    icon: Gauge,
    color: '#818cf8',
    labels: [
      'composer.trigger.phase.warmup',
      'composer.trigger.phase.planning',
      'composer.trigger.phase.execution',
      'composer.trigger.phase.review',
      'composer.trigger.phase.closure',
    ],
  },
  {
    key: 'structure',
    label: 'composer.trigger.structure.label',
    icon: Layers,
    color: '#34d399',
    labels: ['composer.trigger.structure.low', '', 'composer.trigger.structure.mid', '', 'composer.trigger.structure.high'],
  },
  {
    key: 'domain',
    label: 'composer.trigger.domain.label',
    icon: Globe,
    color: '#fb923c',
    labels: ['composer.trigger.domain.low', '', 'composer.trigger.domain.mid', '', 'composer.trigger.domain.high'],
  },
  {
    key: 'resource',
    label: 'composer.trigger.resource.label',
    icon: HardDrive,
    color: '#38bdf8',
    labels: ['composer.trigger.resource.low', '', 'composer.trigger.resource.mid', '', 'composer.trigger.resource.high'],
  },
  {
    key: 'lifecycle',
    label: 'composer.trigger.lifecycle.label',
    icon: RotateCcw,
    color: '#f472b6',
    labels: ['composer.trigger.lifecycle.low', '', 'composer.trigger.lifecycle.mid', '', 'composer.trigger.lifecycle.high'],
  },
]

const DEFAULT_VECTOR: RelevanceVector = {
  phase: 0.5,
  structure: 0.5,
  domain: 0.5,
  resource: 0.5,
  lifecycle: 0.5,
}

// ============================================================================
// DIMENSION SLIDER
// ============================================================================

interface DimensionSliderProps {
  config: DimensionConfig
  value: number
  onChange: (key: keyof RelevanceVector, value: number) => void
}

function DimensionSlider({ config, value, onChange }: DimensionSliderProps) {
  const { t } = useT()
  const Icon = config.icon
  const percentage = Math.round(value * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon size={10} style={{ color: config.color }} />
        <span className="text-[10px] text-slate-400 font-medium flex-1">
          {t(config.label)}
        </span>
        <span
          className="text-[10px] font-mono font-semibold"
          style={{ color: config.color }}
        >
          {percentage}%
        </span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={percentage}
          aria-label={t(config.label)}
          onChange={(e) => onChange(config.key, parseInt(e.target.value) / 100)}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${config.color} ${percentage}%, #1e293b ${percentage}%)`,
            accentColor: config.color,
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between">
        {config.labels.map((label, i) => (
          <span
            key={i}
            className="text-[8px] text-slate-600 w-10 text-center"
            style={
              Math.abs(value - i / (config.labels.length - 1)) < 0.13
                ? { color: config.color }
                : undefined
            }
          >
            {label && t(label)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// TRIGGER BUILDER
// ============================================================================

interface TriggerBuilderProps {
  vector: RelevanceVector
  onChange: (vector: RelevanceVector) => void
}

function TriggerBuilderComponent({ vector, onChange }: TriggerBuilderProps) {
  const { t } = useT()
  const handleDimensionChange = useCallback(
    (key: keyof RelevanceVector, value: number) => {
      onChange({ ...vector, [key]: value })
    },
    [vector, onChange]
  )

  const handleReset = useCallback(() => {
    onChange(DEFAULT_VECTOR)
  }, [onChange])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-slate-400">
          {t('composer.trigger.title')}
        </h4>
        <button
          onClick={handleReset}
          className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
          title={t('composer.trigger.resetHint')}
        >
          {t('composer.trigger.reset')}
        </button>
      </div>

      <p className="text-[9px] text-slate-600 leading-relaxed">
        {t('composer.trigger.intro')}
      </p>

      <div className="space-y-3">
        {DIMENSIONS.map((dim) => (
          <DimensionSlider
            key={dim.key}
            config={dim}
            value={vector[dim.key]}
            onChange={handleDimensionChange}
          />
        ))}
      </div>
    </div>
  )
}

export const TriggerBuilder = memo(TriggerBuilderComponent)
export { DEFAULT_VECTOR }
