/** 为资源接口提供 JSON 和文件传输的 Axios 边界，不执行自动重试。 */

import axios, {
  type AxiosProgressEvent,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { CloudClientError } from '../errors';
import type { CloudClientOptions, CloudProgress, CloudRequestOptions } from '../index';
import type { ApiResponse } from './types';

type QueryParams = Readonly<Record<string, string | number | boolean | undefined>>;
type ParsedJson = { valid: true; value: unknown } | { valid: false };
type CloudAxiosRequestConfig = AxiosRequestConfig & { requiresAccessToken: boolean };

type InternalCloudAxiosRequestConfig = InternalAxiosRequestConfig & { requiresAccessToken?: boolean };

/** 单个资源请求的内部定义，不包含任意 Axios 配置。 */
export interface HttpRequest<TResponse = unknown> {
  /** 请求方法。 */
  method: 'GET' | 'POST' | 'PATCH';
  /** 相对固定服务与渠道前缀的路径。 */
  path: string;
  /** JSON 或资源方法构造的请求体；无请求体时缺席。 */
  data?: unknown;
  /** 由资源方法显式提供的查询参数。 */
  params?: QueryParams;
  /** 是否读取并附带当前 Access Token。 */
  requiresAccessToken: boolean;
  /** 单次请求取消、超时覆盖值和文件进度回调。 */
  options?: CloudRequestOptions;
  /** 内部文件请求使用 Blob 响应；普通 API 仍解包 JSON 封套。 */
  responseType?: AxiosRequestConfig['responseType'];
}

/** 下载文件请求仅允许访问已声明的相对资源路径。 */
export interface HttpFileRequest {
  /** 相对固定服务与渠道前缀的下载路径。 */
  path: string;
  /** 是否读取并附带当前 Access Token。 */
  requiresAccessToken: boolean;
  /** 单次请求取消、超时覆盖值和可选下载进度。 */
  options?: CloudRequestOptions;
}

/** 一次文件下载的二进制载荷及可取得的响应头。 */
export interface HttpFileResponse {
  /** 服务端返回的 Blob 文件载荷。 */
  body: Blob;
  /** 响应媒体类型；未提供时为 null。 */
  contentType: string | null;
  /** 附件响应头；未提供时为 null。 */
  contentDisposition: string | null;
}

/** 云端资源接口使用的内部传输边界，不作为包公开入口导出。 */
export interface HttpClient {
  /** 发送一次 JSON 或 multipart 请求，并返回响应封套中的业务数据。 */
  request<TResponse>(input: HttpRequest<TResponse>): Promise<TResponse>;
  /** 发送一次二进制下载并保留必要响应头。 */
  requestFile(input: HttpFileRequest): Promise<HttpFileResponse>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** 判断运行时 FormData 请求体，避免 Axios 默认表单类型覆盖自动 boundary。 */
function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

/** 以 Axios 实际传输事件发布字节进度，并在结束或取消后关闭通知。 */
function createProgressObserver(
  callback: CloudRequestOptions['onProgress'] | undefined,
  signal?: AbortSignal,
): { report: (event: AxiosProgressEvent) => void; stop: () => void } | undefined {
  if (!callback) {
    return undefined;
  }

  let active = !signal?.aborted;
  const stop = () => {
    active = false;
    signal?.removeEventListener('abort', stop);
  };
  if (active) {
    signal?.addEventListener('abort', stop, { once: true });
  }

  return {
    report: (event) => {
      if (!active) {
        return;
      }

      const total = event.total;
      const totalBytes = typeof total === 'number' && Number.isFinite(total) && total > 0
        ? total
        : undefined;
      const progress: CloudProgress = totalBytes === undefined
        ? { loadedBytes: event.loaded }
        : { loadedBytes: event.loaded, totalBytes };
      callback(progress);
    },
    stop,
  };
}

/** 校验 HTTP(S) 服务根地址并去掉末尾斜线。 */
function normalizeBaseUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, '');
  const isHttpUrl = /^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/i.test(baseUrl);

  if (!isHttpUrl) {
    throw new TypeError('baseUrl 必须是有效的 HTTP(S) 服务根地址');
  }

  return baseUrl;
}

/** 将普通渠道编码为单一路径段，并拒绝管理端渠道。 */
function normalizeChannel(value: string): string {
  const channel = value.trim();

  if (!channel || channel.toLowerCase() === 'manager' || channel.includes('/')) {
    throw new TypeError('channel 必须是有效的普通用户渠道');
  }

  return encodeURIComponent(channel);
}

/** 解析客户端默认值或单次请求覆盖值，并拒绝无效超时。 */
function resolveTimeout(
  requestTimeoutMs: number | undefined,
  clientTimeoutMs: number | undefined,
): number {
  const timeoutMs = requestTimeoutMs ?? clientTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs 必须是正数');
  }

  return timeoutMs;
}

/** 防止内部请求路径逃出固定的服务与渠道作用域。 */
function assertRelativePath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('://') || path.split('/').includes('..')) {
    throw new TypeError('请求路径必须是作用域内的相对路径');
  }
}

/** 判断响应正文是否包含 API 包装的必要字段。 */
function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'code' in value &&
    typeof value.code === 'string' &&
    'data' in value
  );
}

/** 解析 Axios 已解码或尚未解码的 JSON 正文。 */
function parseJsonBody(value: unknown): ParsedJson {
  if (typeof value !== 'string') {
    return { valid: true, value };
  }

  try {
    return { valid: true, value: JSON.parse(value) as unknown };
  } catch {
    return { valid: false };
  }
}
interface PromiseResolvers<TValue> {
  /** 等待原生 FileReader 完成的 Promise。 */
  promise: Promise<TValue>;
  /** 以文件文本完成 Promise。 */
  resolve(value: TValue | PromiseLike<TValue>): void;
  /** 以安全的读取错误拒绝 Promise。 */
  reject(reason?: unknown): void;
}

/** 优先使用标准 resolver 工厂，并兼容未提供该 API 的旧 Hermes。 */
function createDeferred<TValue>(): PromiseResolvers<TValue> {
  const promiseConstructor = Promise as PromiseConstructor & {
    withResolvers?: <T>() => PromiseResolvers<T>;
  };
  if (promiseConstructor.withResolvers) {
    return promiseConstructor.withResolvers<TValue>();
  }

  let resolve!: PromiseResolvers<TValue>['resolve'];
  let reject!: PromiseResolvers<TValue>['reject'];
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** 使用 React Native FileReader 读取没有 Blob.text() 的原生 Blob。 */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(new Error('文件读取能力不可用'));
  }

  const { promise, resolve, reject } = createDeferred<string>();
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
    } else {
      reject(new Error('文件文本读取失败'));
    }
  };
  reader.onerror = () => reject(new Error('文件文本读取失败'));
  reader.onabort = () => reject(new Error('文件文本读取已取消'));
  reader.readAsText(blob);
  return promise;
}

/** 读取失败正文并释放原生 Blob；读取失败时只保留通用安全错误。 */
async function readErrorBody(value: unknown): Promise<unknown> {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const nativeBlob = value as Blob & { text?: () => Promise<string>; close?: () => void };
    try {
      return typeof nativeBlob.text === 'function'
        ? await nativeBlob.text()
        : await readBlobText(nativeBlob);
    } catch {
      return undefined;
    } finally {
      nativeBlob.close?.();
    }
  }

  return value;
}

/** 读取响应头中的字符串值，不暴露响应对象本身。 */
function readHeader(headers: AxiosResponse<unknown>['headers'], name: string): string | undefined {
  const rawHeaders = headers as unknown as Record<string, unknown>;
  const getter = rawHeaders.get;
  const value: unknown = typeof getter === 'function'
    ? getter.call(headers, name)
    : rawHeaders[name.toLowerCase()] ?? rawHeaders[name];

  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value) && value.every((part) => typeof part === 'string')) {
    return value.join(', ');
  }

  return undefined;
}

/** 优先使用响应包装中的请求标识，再回退到响应头。 */
function readRequestId(
  body: ApiResponse<unknown> | undefined,
  headers: AxiosResponse<unknown>['headers'],
): string | undefined {
  const requestId = body?.requestId;
  return typeof requestId === 'string' && requestId.trim()
    ? requestId
    : readHeader(headers, 'X-Request-ID');
}

/** 从有效错误包装中读取可用的业务码和安全消息。 */
async function toApiError(response: AxiosResponse<unknown>): Promise<CloudClientError> {
  const parsed = parseJsonBody(await readErrorBody(response.data));
  const body = parsed.valid && isApiResponse(parsed.value) ? parsed.value : undefined;
  const code = body?.code;
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message
    : '服务请求失败';

  return new CloudClientError({
    kind: 'api',
    message,
    status: response.status,
    code,
    requestId: readRequestId(body, response.headers),
    retryAfter: readHeader(response.headers, 'Retry-After'),
  });
}

/** 将 Axios、取消、超时和网络异常压缩为不含原始配置的错误。 */
async function toCloudClientError(error: unknown): Promise<CloudClientError> {
  if (error instanceof CloudClientError) {
    return error;
  }
  if (axios.isCancel(error) || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_CANCELED')) {
    return new CloudClientError({ kind: 'cancelled', message: '请求已取消' });
  }

  if (!axios.isAxiosError(error)) {
    return new CloudClientError({ kind: 'protocol', message: '请求处理失败' });
  }

  if (error.response) {
    return toApiError(error.response);
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new CloudClientError({ kind: 'timeout', message: '请求超时' });
  }

  return new CloudClientError({ kind: 'network', message: '网络请求失败' });
}

/** 验证成功 HTTP 响应封套并返回未校验的业务数据。 */
function unwrapResponse(response: AxiosResponse<unknown>): unknown {
  const parsed = parseJsonBody(response.data);
  const body = parsed.valid && isApiResponse(parsed.value) ? parsed.value : undefined;

  if (!body) {
    throw new CloudClientError({
      kind: 'protocol',
      message: '服务响应格式无效',
      status: response.status,
      requestId: readRequestId(undefined, response.headers),
    });
  }

  if (body.code !== 'OK') {
    throw new CloudClientError({
      kind: 'api',
      message: typeof body.message === 'string' && body.message.trim() ? body.message : '服务请求失败',
      status: response.status,
      code: body.code,
      requestId: readRequestId(body, response.headers),
      retryAfter: readHeader(response.headers, 'Retry-After'),
    });
  }

  return body.data;
}

/** 创建只使用已配置服务、渠道和外部 Access Token 来源的传输客户端。 */
export function createHttpClient(options: CloudClientOptions): HttpClient {
  const baseURL = `${normalizeBaseUrl(options.baseUrl)}/api/v1/${normalizeChannel(options.channel)}`;
  const client = axios.create({
    baseURL,
    timeout: resolveTimeout(undefined, options.timeoutMs),
    headers: { Accept: 'application/json' },
  });

  client.interceptors.request.use((config) => {
    const requestConfig = config as InternalCloudAxiosRequestConfig;
    if (requestConfig.requiresAccessToken) {
      const accessToken = options.getAccessToken();
      if (accessToken) {
        config.headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    if (isFormDataBody(config.data)) {
      config.headers.set('Content-Type', false);
    }

    return config;
  });
  client.interceptors.response.use(
    (response) => {
      if (response.config.responseType === 'blob') {
        return response;
      }

      response.data = unwrapResponse(response);
      return response;
    },
    async (error: unknown) => {
      throw await toCloudClientError(error);
    },
  );

  function request<TResponse>(input: HttpRequest<TResponse>): Promise<TResponse> {
    const {
      method,
      path,
      data,
      params,
      options: requestOptions,
      requiresAccessToken,
      responseType,
    } = input;
    assertRelativePath(path);

    const progressObserver = isFormDataBody(data)
      ? createProgressObserver(requestOptions?.onProgress, requestOptions?.signal)
      : undefined;
    const requestConfig: CloudAxiosRequestConfig = {
      method,
      url: path,
      data,
      params,
      signal: requestOptions?.signal,
      timeout: resolveTimeout(requestOptions?.timeoutMs, options.timeoutMs),
      requiresAccessToken,
      responseType,
    };

    if (progressObserver) {
      requestConfig.onUploadProgress = progressObserver.report;
    }

    const result = client.request<unknown, AxiosResponse<TResponse>>(requestConfig)
      .then((response) => response.data);
    return progressObserver ? result.finally(progressObserver.stop) : result;
  }

  function requestFile(input: HttpFileRequest): Promise<HttpFileResponse> {
    assertRelativePath(input.path);
    const progressObserver = createProgressObserver(input.options?.onProgress, input.options?.signal);
    const requestConfig: CloudAxiosRequestConfig = {
      method: 'GET',
      url: input.path,
      signal: input.options?.signal,
      timeout: resolveTimeout(input.options?.timeoutMs, options.timeoutMs),
      requiresAccessToken: input.requiresAccessToken,
      responseType: 'blob',
    };

    if (progressObserver) {
      requestConfig.onDownloadProgress = progressObserver.report;
    }

    const result = client.request<Blob, AxiosResponse<Blob>>(requestConfig).then((response) => ({
      body: response.data,
      contentType: readHeader(response.headers, 'Content-Type') ?? null,
      contentDisposition: readHeader(response.headers, 'Content-Disposition') ?? null,
    }));
    return progressObserver ? result.finally(progressObserver.stop) : result;
  }

  return { request, requestFile };
}
