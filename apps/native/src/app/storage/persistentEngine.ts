/** 将 MMKV 字符串键值接口适配为 Nano Stores persistent 引擎。 */

/** MMKV 引擎所需的同步字符串存储能力。 */
export interface MMKVStoragePort {
  /** 读取键对应的字符串；缺失键返回 undefined。 */
  getString(key: string): string | undefined
  /** 同步写入字符串值；失败时抛出原生存储错误。 */
  set(key: string, value: string): void
  /** 删除键并返回是否实际删除。 */
  remove(key: string): boolean
  /** 判断键是否存在。 */
  contains(key: string): boolean
  /** 返回当前存储中的键集合。 */
  getAllKeys(): string[]
}

/** 创建无内存副本的持久化引擎；底层读写异常原样向调用方传播。 */
export function createPersistentStorageEngine(storage: MMKVStoragePort): Record<string, string> {
  const target = Object.create(null) as Record<string, string>

  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property !== 'string') return Reflect.get(current, property, receiver)
      return storage.getString(property)
    },
    set(_current, property, value) {
      if (typeof property !== 'string' || typeof value !== 'string') {
        throw new TypeError('偏好存储仅支持字符串键和值。')
      }
      storage.set(property, value)
      return true
    },
    deleteProperty(current, property) {
      if (typeof property !== 'string') return Reflect.deleteProperty(current, property)
      storage.remove(property)
      return true
    },
    has(current, property) {
      if (typeof property !== 'string') return Reflect.has(current, property)
      return storage.contains(property)
    },
    ownKeys() {
      return storage.getAllKeys()
    },
    getOwnPropertyDescriptor(_current, property) {
      if (typeof property !== 'string' || !storage.contains(property)) return undefined
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: storage.getString(property),
      }
    },
  })
}
