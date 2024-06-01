export const pick = <T extends object, K extends (keyof T)[]>(obj: T, ...args: K) => {
  return Object.fromEntries(Object.entries(obj).filter(entry => args.includes(entry[0] as keyof T))) as Pick<T, K[number]>
}