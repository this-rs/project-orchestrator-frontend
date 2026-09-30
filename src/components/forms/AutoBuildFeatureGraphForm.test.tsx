import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AutoBuildFeatureGraphForm } from './AutoBuildFeatureGraphForm'

function Harness({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) {
  const form = AutoBuildFeatureGraphForm({ projects: [{ id: 'p1', name: 'Backend' }], onSubmit })
  return (
    <div>
      {form.fields}
      <button type="button" onClick={() => void form.submit()}>
        go
      </button>
    </div>
  )
}

describe('AutoBuildFeatureGraphForm help', () => {
  it('explains the entry function and warns when depth is large', () => {
    render(<Harness onSubmit={vi.fn()} />)
    expect(screen.getByText(/follows its calls/)).toBeTruthy()
    expect(screen.getByText(/Exact name of a function/)).toBeTruthy()
    expect(screen.getByTestId('depth-hint').textContent).toMatch(/few dozen/)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '3' } })
    expect(screen.getByTestId('depth-hint').textContent).toMatch(/few hundred/)
    fireEvent.change(slider, { target: { value: '5' } })
    expect(screen.getByTestId('depth-hint').textContent).toMatch(/thousands/)
  })

  it('validates then submits with the chosen depth', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Harness onSubmit={onSubmit} />)
    await act(async () => fireEvent.click(screen.getByText('go')))
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('Feature graph name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. handle_request'), { target: { value: 'main' } })
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    await act(async () => fireEvent.click(screen.getByText('go')))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ entry_function: 'main', depth: 4, project_id: 'p1' }))
  })
})
