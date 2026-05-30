export const isDiagnosticsEnabled =
  process.env.ENABLE_FIREFOX_DIAGNOSTICS === 'true'

export function setDiagnosticAttr(name: string, value: unknown) {
  if (!isDiagnosticsEnabled) return
  document.documentElement.setAttribute(name, String(value))
}

export function removeDiagnosticAttr(name: string) {
  if (!isDiagnosticsEnabled) return
  document.documentElement.removeAttribute(name)
}

export function formatDiagnosticError(error: unknown) {
  return (
    ((error as any)?.toString && (error as any).toString()) ||
    (error as Error)?.message ||
    String(error)
  )
}
