// @vitest-environment jsdom

import { useCallback, useState } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Line, LineChart } from 'recharts'
import { MeasuredResponsiveContainer } from './MeasuredResponsiveContainer'
import { useChartDensity } from './useChartDensity'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Chart() {
  const [width, setWidth] = useState(0)
  const onResize = useCallback((nextWidth: number) => setWidth(nextWidth), [])
  const density = useChartDensity(width)
  return (
    <div style={{ width: '100%', minWidth: 0, height: 260, minHeight: 260 }}>
      <output>{density.tier}</output>
      <MeasuredResponsiveContainer onResize={onResize}>
        <LineChart data={[{ value: 10 }, { value: 20 }]}>
          <Line dataKey="value" isAnimationActive={false} />
        </LineChart>
      </MeasuredResponsiveContainer>
    </div>
  )
}

it('waits for layout, resizes with density, and recovers after being hidden without warnings', () => {
  const callbacks: ResizeObserverCallback[] = []
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback) }
    observe = vi.fn()
    disconnect = disconnect
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { container, getByText, unmount } = render(<Chart />)
  const resize = (width: number, height: number) => act(() => {
    callbacks[0]([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
  })
  const surface = () => container.querySelector('svg.recharts-surface')
  const placeholder = () => container.querySelector('.chart-size-placeholder')

  expect(placeholder()).not.toBeNull()
  expect(surface()).toBeNull()
  expect(getByText('desktop')).toBeTruthy()
  for (const [width, height] of [[0, 0], [320, 0], [0, 260], [-1, -1], [0.1, 260]]) {
    resize(width, height)
    expect(placeholder()).not.toBeNull()
    expect(surface()).toBeNull()
  }

  resize(320, 260)
  expect(placeholder()).toBeNull()
  expect(surface()?.getAttribute('width')).toBe('320')
  expect(surface()?.getAttribute('height')).toBe('260')
  expect(getByText('phone')).toBeTruthy()

  resize(700, 360)
  expect(surface()?.getAttribute('width')).toBe('700')
  expect(surface()?.getAttribute('height')).toBe('360')
  expect(getByText('tablet')).toBeTruthy()

  resize(0, 0)
  expect(placeholder()).not.toBeNull()
  expect(surface()).toBeNull()
  resize(1000, 480)
  expect(surface()?.getAttribute('width')).toBe('1000')
  expect(getByText('desktop')).toBeTruthy()

  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  unmount()
  expect(disconnect).toHaveBeenCalled()
})
