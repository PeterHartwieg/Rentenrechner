import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import './MeasuredResponsiveContainer.css'

interface Props {
  children: ReactNode
  onResize?: (width: number, height: number) => void
}

/** Keep the frame in layout, but defer Recharts until it has a usable size. */
export function MeasuredResponsiveContainer({ children, onResize }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      // Match Recharts' pixel rounding, including subpixel/hidden frames.
      const next = {
        width: Number.isFinite(width) ? Math.round(width) : 0,
        height: Number.isFinite(height) ? Math.round(height) : 0,
      }
      setSize((previous) => previous.width === next.width && previous.height === next.height
        ? previous
        : next)
      onResize?.(width, height)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [onResize])

  const ready = size.width > 0 && size.height > 0
  return (
    <div className="measured-chart-frame" ref={frameRef}>
      {ready ? (
        // Numeric dimensions bypass Recharts' own initial -1 × -1 measurement.
        // This frame's observer continues to supply responsive dimensions.
        <ResponsiveContainer width={size.width} height={size.height}>
          {children}
        </ResponsiveContainer>
      ) : (
        <div className="chart-size-placeholder" aria-hidden="true" />
      )}
    </div>
  )
}
