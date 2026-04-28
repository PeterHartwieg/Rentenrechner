export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function updateNumber<T extends object>(
  setter: React.Dispatch<React.SetStateAction<T>>,
  key: keyof T,
  value: string,
) {
  setter((current) => ({
    ...current,
    [key]: Number(value),
  }))
}
