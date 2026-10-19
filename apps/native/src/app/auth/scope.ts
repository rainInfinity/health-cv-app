/** 规范化认证与缓存使用的服务地址/渠道作用域。 */

/** 描述安全凭据和受保护缓存共用的服务作用域。 */
export interface AuthScope {
  /** 不含 API 版本段的规范化服务根地址。 */
  serviceRoot: string;
  /** 显式注入的普通用户渠道。 */
  channel: string;
}

/** 校验并规范化服务根地址及普通用户渠道。 */
export function createAuthScope(serviceRoot: string, channel: string): AuthScope {
  const parsed = new URL(serviceRoot.trim());
  const normalizedChannel = channel.trim();
  const path = parsed.pathname.replace(/\/+$/, '');

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !normalizedChannel ||
    normalizedChannel.toLowerCase() === 'manager' ||
    normalizedChannel.includes('/')
  ) {
    throw new TypeError('服务作用域必须是有效的普通渠道配置');
  }

  return {
    serviceRoot: `${parsed.origin}${path}`,
    channel: normalizedChannel,
  };
}

/** 为安全存储键生成仅含十六进制与分隔符的无歧义作用域标识。 */
export function createCredentialStorageKey(scope: AuthScope): string {
  return `healthcv.credentials.${encodeUtf16(scope.serviceRoot)}.${encodeUtf16(scope.channel)}`;
}

/** 将 UTF-16 字符单元编码为固定宽度十六进制，避免依赖原生编码器。 */
function encodeUtf16(value: string): string {
  let encoded = '';
  for (let index = 0; index < value.length; index += 1) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return encoded;
}
