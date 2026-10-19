/** 从 Expo 显式环境变量读取服务根地址和普通渠道。 */

declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_CHANNEL?: string;
  };
};

/** 定义应用启动时注入的服务地址与渠道。 */
export interface RuntimeConfig {
  /** 不含 `/api/v1` 的 HTTP(S) 服务根地址。 */
  baseUrl: string;
  /** 显式配置的普通用户渠道。 */
  channel: string;
}

/** 缺少任一配置时返回 null，不推断默认渠道或服务地址。 */
export function readRuntimeConfig(): RuntimeConfig | null {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const channel = process.env.EXPO_PUBLIC_CHANNEL?.trim();
  return baseUrl && channel ? { baseUrl, channel } : null;
}
