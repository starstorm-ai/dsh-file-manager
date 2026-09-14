/** Convert CSS shorthand hex colors into Monaco's required RRGGBB/RRGGBBAA form. */
export function normalizeMonacoColor(value: string): string {
  const shorthand = /^#([\da-f]{3}|[\da-f]{4})$/i.exec(value.trim())
  if (shorthand === null) return value.trim()
  return `#${[...shorthand[1]!].map(component => `${component}${component}`).join('')}`
}
