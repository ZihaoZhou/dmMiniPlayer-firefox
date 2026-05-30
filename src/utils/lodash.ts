export const assign = Object.assign

export const isArray = Array.isArray

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'

export const isFunction = (value: unknown): value is (...args: any[]) => any =>
  typeof value === 'function'

export const isNull = (value: unknown): value is null => value === null

export const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

export const isString = (value: unknown): value is string =>
  typeof value === 'string'

export const isUndefined = (value: unknown): value is undefined =>
  value === undefined

export const cloneDeep = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}
