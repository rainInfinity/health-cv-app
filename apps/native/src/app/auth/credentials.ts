/** 将作用域内的令牌对作为单条记录接入平台安全存储。 */

import type { AuthScope } from './scope';
import { createCredentialStorageKey } from './scope';
import type { CredentialPair, CredentialStorage } from './types';

/** 表示安全存储读写删除失败，不携带底层异常或令牌内容。 */
export class CredentialStorageError extends Error {
  /** 失败的安全存储操作。 */
  readonly operation: 'read' | 'write' | 'delete';

  /** 创建不泄露原生异常的安全存储错误。 */
  constructor(operation: 'read' | 'write' | 'delete') {
    super(`安全凭据${operation === 'read' ? '读取' : operation === 'write' ? '写入' : '删除'}失败`);
    this.name = 'CredentialStorageError';
    this.operation = operation;
  }
}

/** 提供 SecureStore 所需的最小异步键值接口，便于隔离平台边界。 */
export interface SecureStorePort {
  /** 读取一个安全存储条目。 */
  getItemAsync(key: string): Promise<string | null>;
  /** 写入一个安全存储条目。 */
  setItemAsync(key: string, value: string): Promise<void>;
  /** 删除一个安全存储条目。 */
  deleteItemAsync(key: string): Promise<void>;
}

/** 构造按服务地址和渠道隔离、无普通存储回退的令牌对适配器。 */
export function createSecureCredentialStore(
  scope: AuthScope,
  secureStore: SecureStorePort,
): CredentialStorage {
  const key = createCredentialStorageKey(scope);

  return {
    async read() {
      let value: string | null;
      try {
        value = await secureStore.getItemAsync(key);
      } catch {
        throw new CredentialStorageError('read');
      }

      if (value === null) {
        return null;
      }

      try {
        const parsed: unknown = JSON.parse(value);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'accessToken' in parsed &&
          typeof parsed.accessToken === 'string' &&
          parsed.accessToken.length > 0 &&
          'refreshToken' in parsed &&
          typeof parsed.refreshToken === 'string' &&
          parsed.refreshToken.length > 0
        ) {
          return {
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
          };
        }
      } catch {
        throw new CredentialStorageError('read');
      }

      throw new CredentialStorageError('read');
    },
    async write(tokens) {
      try {
        await secureStore.setItemAsync(key, JSON.stringify(tokens));
      } catch {
        throw new CredentialStorageError('write');
      }
    },
    async delete() {
      try {
        await secureStore.deleteItemAsync(key);
      } catch {
        throw new CredentialStorageError('delete');
      }
    },
  };
}
