export interface AppCheckDebugTarget {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string
}

export function configureAppCheckDebugToken(input: {
  isDevelopment: boolean
  useEmulators: boolean
  configuredValue?: string
  target: AppCheckDebugTarget
}) {
  const configuredValue = input.configuredValue?.trim()

  if (!input.isDevelopment || input.useEmulators || !configuredValue)
    return false

  input.target.FIREBASE_APPCHECK_DEBUG_TOKEN = configuredValue.toLocaleLowerCase('en-US') === 'true'
    ? true
    : configuredValue

  return true
}
