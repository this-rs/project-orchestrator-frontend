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

// ============================================================================
// DIMENSION CONFIG
// ============================================================================

interface DimensionConfig {
  key: keyof RelevanceVector
  label: string
  icon: typeof Gauge
  color: string
  description: string
  labels: string[]
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: 'phase',
    label: 'Phase',
    icon: Gauge,
    color: '#818cf8',
    description: 'Project lifecycle phase',
    labels: ['Warmup', 'Planning', 'Execution', 'Review', 'Closure'],
  },
  {
    key: 'structure',
    label: 'Structure',
    icon: Layers,
    color: '#34d399',
    description: 'Codebase structural complexity',
    labels: ['Simple', '', 'Moderate', '', 'Complex'],
  },
  {
    key: 'domain',
    label: 'Domain',
    icon: Globe,
    color: '#fb923c',
    description: 'Domain knowledge required',
    labels: ['Generic', '', 'Moderate', '', 'Specialized'],
  },
  {
    key: 'resource',
    label: 'Resource',
    icon: HardDrive,
    color: '#38bdf8',
    description: 'Resource intensity',
    labels: ['Light', '', 'Medium', '', 'Heavy'],
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    icon: RotateCcw,
    color: '#f472b6',
    description: 'Entity lifecycle maturity',
    labels: ['New', '', 'Active', '', 'Mature'],
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
  const Icon = config.icon
  const percentage = Math.round(value * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon size={10} style={{ color: config.color }} />
        <span className="text-[10px] text-slate-400 font-medium flex-1">
          {config.label}
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
            {label}
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
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Relevance Vector
        </h4>
        <button
          onClick={handleReset}
          className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      </div>

      <p className="text-[9px] text-slate-600 leading-relaxed">
        Define when this protocol should activate. Higher values mean the protocol is
        more relevant in that dimension.
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
