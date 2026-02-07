interface SelectCheckboxProps {
  checked: boolean
  onChange: () => void
}

export function SelectCheckbox({ checked, onChange }: SelectCheckboxProps) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onChange()
      }}
      className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8 shrink-0 self-center cursor-pointer"
    >
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="h-4 w-4 rounded border-white/[0.1] bg-[#0f1117] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 pointer-events-none"
      />
    </div>
  )
}
