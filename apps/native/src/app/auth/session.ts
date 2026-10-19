/** 管理令牌恢复、身份确认、受保护请求和会话代次隔离。 */

import { atom, readonlyType, type ReadableAtom } from 'nanostores';
import type { QueryClient } from '@tanstack/react-query';
import type { CloudClient, CloudRequestOptions, Req, Rsp } from '@health-cv-app/cloud-client';

import { CredentialStorageError } from './credentials';
import type { AuthScope } from './scope';
import type {
  AccessTokenSource,
  AuthState,
  AuthUnavailableReason,
  CredentialPair,
  CredentialStorage,
  LogoutResult,
} from './types';
import { isScopedServerKey } from '../query/keys';

/** 认证命令可识别的本地会话错误类别。 */
export type AuthSessionErrorCode =
  | 'not-authenticated'
  | 'session-changed'
  | 'operation-cancelled'
  | 'credential-storage-failed'
  | 'cache-cleanup-failed';

/** 表示本地会话边界失败，不包含令牌或请求配置。 */
export class AuthSessionError extends Error {
  /** 可稳定判别的本地失败类别。 */
  readonly code: AuthSessionErrorCode;

  /** 创建不带敏感信息的认证会话错误。 */
  constructor(code: AuthSessionErrorCode) {
    super(code);
    this.name = 'AuthSessionError';
    this.code = code;
  }
}

/** 定义认证服务依赖的 SDK、作用域、查询缓存和私有令牌引用。 */
export interface AuthSessionOptions {
  /** 单次请求云端客户端。 */
  client: CloudClient;
  /** 当前服务地址与渠道作用域。 */
  scope: AuthScope;
  /** 当前作用域的安全凭据存储适配器。 */
  credentials: CredentialStorage;
  /** 清理受保护查询和变更缓存的 QueryClient。 */
  queryClient: QueryClient;
  /** 仅供云客户端请求拦截器读取的 Access Token 引用。 */
  accessTokenSource: AccessTokenSource;
}

/** 公开认证命令与只读状态，不暴露内部令牌对。 */
export interface AuthSessionManager {
  /** Nano Stores 只读认证状态。 */
  state: ReadableAtom<AuthState>;
  /** 恢复一次当前作用域凭据并确认当前账号。 */
  restore(): Promise<void>;
  /** 注册普通账号，不建立或改变会话。 */
  register(credentials: Req.Auth.AccountCredentialsRequest): Promise<Rsp.Users.UserAccount>;
  /** 登录、保存令牌对并确认账号后返回公开账号信息。 */
  signIn(credentials: Req.Auth.AccountCredentialsRequest): Promise<Rsp.Users.UserAccount>;
  /** 结束本地会话并尽力撤销远端 Refresh Token。 */
  signOut(): Promise<LogoutResult>;
  /** 通过受控刷新执行单个受保护操作。 */
  runProtected<TResponse>(
    operation: (options: CloudRequestOptions) => Promise<TResponse>,
    options?: CloudRequestOptions,
    expectedGeneration?: number,
  ): Promise<TResponse>;
  /** 读取不含令牌信息的当前会话代次。 */
  getSessionGeneration(): number;
  /** 判断指定代次仍是当前已确认会话。 */
  isAuthenticatedAt(generation: number): boolean;
}

interface RefreshFlight {
  /** 发起刷新时的会话代次。 */
  generation: number;
  /** 同一会话并发共享的令牌轮换。 */
  promise: Promise<CredentialPair>;
}

interface SessionTransition {
  /** 新的会话代次。 */
  generation: number;
  /** 串行化后的安全凭据删除结果。 */
  credentialDeletion: Promise<void>;
  /** 取消并清除旧作用域缓存的结果。 */
  cacheCleanup: Promise<void>;
}

interface ApiErrorLike {
  /** 不含请求配置的结构化错误类型。 */
  kind: string;
  /** HTTP 状态码；非 HTTP 失败时为空。 */
  status?: number;
  /** 后端稳定错误码；非 API 错误时为空。 */
  code?: string;
}

/** 判断对象是否为云端 API 错误的最小安全判别字段。 */
function isApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    error.kind === 'api' &&
    'status' in error
  );
}

/** 只识别后端明确的 Access 失效，不把 403 或其他 401 当作刷新信号。 */
function isInvalidAccessError(error: unknown): boolean {
  return isApiError(error) && error.status === 401 && error.code === 'INVALID_TOKEN';
}

/** 判断确认失败是否来自暂时不可达或服务端故障。 */
function isTransientFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('kind' in error && (error.kind === 'network' || error.kind === 'timeout')) {
    return true;
  }

  return 'status' in error && typeof error.status === 'number' && error.status >= 500;
}

/** 将存储或网络失败映射成不含服务端文案的公开原因码。 */
function unavailableReason(error: unknown, fallback: AuthUnavailableReason): AuthUnavailableReason {
  if (error instanceof CredentialStorageError) {
    return 'credential-storage';
  }
  return isTransientFailure(error) ? 'network' : fallback;
}

interface PromiseResolvers<TValue> {
  /** 等待事件最终完成的 Promise。 */
  promise: Promise<TValue>;
  /** 以结果值完成 Promise。 */
  resolve(value: TValue | PromiseLike<TValue>): void;
  /** 以失败原因拒绝 Promise。 */
  reject(reason?: unknown): void;
}

/** 优先使用标准 resolver 工厂；旧版 Hermes 缺少该 API 时兼容回退。 */
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

/** 为一个等待者取消共享 Promise 的等待，不取消共享刷新本身。 */
function waitWithAbort<TValue>(promise: Promise<TValue>, signal: AbortSignal): Promise<TValue> {
  if (signal.aborted) {
    return Promise.reject(new AuthSessionError('operation-cancelled'));
  }

  const { promise: waitPromise, resolve, reject } = createDeferred<TValue>();
  const cleanup = () => signal.removeEventListener('abort', onAbort);
  const onAbort = () => {
    cleanup();
    reject(new AuthSessionError('operation-cancelled'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  promise.then(
    (value) => {
      cleanup();
      resolve(value);
    },
    (error: unknown) => {
      cleanup();
      reject(error);
    },
  );
  return waitPromise;
}

/** 创建一个职责单一的应用端认证会话管理器。 */
export function createAuthSessionManager(options: AuthSessionOptions): AuthSessionManager {
  const internalState = atom<AuthState>({ status: 'restoring' });
  const state = readonlyType(internalState);
  const activeRequests = new Map<number, Set<AbortController>>();
  let tokenPair: CredentialPair | null = null;
  let sessionGeneration = 0;
  let tokenRevision = 0;
  let refreshFlight: RefreshFlight | null = null;
  let restorePromise: Promise<void> | null = null;
  let credentialQueue = Promise.resolve();

  /** 按调用顺序执行凭据写入和删除，避免旧会话提交覆盖新会话。 */
  function enqueueCredentialOperation<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    const result = credentialQueue.then(operation, operation);
    credentialQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** 只在安全存储操作成功后发布令牌对给请求拦截器。 */
  function publishTokens(tokens: CredentialPair | null): void {
    tokenPair = tokens;
    options.accessTokenSource.current = tokens?.accessToken ?? null;
    tokenRevision += 1;
  }

  /** 保存轮换后的令牌对；会话已变化时不发布也不回滚旧令牌。 */
  async function persistTokens(tokens: CredentialPair, generation: number): Promise<boolean> {
    try {
      return await enqueueCredentialOperation(async () => {
        if (generation !== sessionGeneration) {
          return false;
        }
        await options.credentials.write(tokens);
        return generation === sessionGeneration;
      });
    } catch (error) {
      if (generation === sessionGeneration) {
        publishTokens(null);
        internalState.set({ status: 'unavailable', reason: 'credential-storage' });
      }
      throw error;
    }
  }

  /** 取消旧代次请求并清除其受保护查询和变更记录。 */
  async function clearProtectedCache(generation: number): Promise<void> {
    const belongsToSession = (key: readonly unknown[] | undefined) =>
      isScopedServerKey(key, options.scope, generation);
    const filters = {
      predicate: (query: { queryKey: readonly unknown[] }) => belongsToSession(query.queryKey),
    };
    const cancellation = options.queryClient.cancelQueries(filters);
    options.queryClient.removeQueries(filters);

    const mutationCache = options.queryClient.getMutationCache();
    for (const mutation of mutationCache.getAll()) {
      if (belongsToSession(mutation.options.mutationKey)) {
        mutationCache.remove(mutation);
      }
    }

    await cancellation;
  }

  /** 关闭一个代次并立即隔离令牌、请求与认证状态。 */
  function beginTransition(nextState: AuthState): SessionTransition {
    const retiredGeneration = sessionGeneration;
    sessionGeneration += 1;
    const generation = sessionGeneration;
    publishTokens(null);
    internalState.set(nextState);

    for (const controller of activeRequests.get(retiredGeneration) ?? []) {
      controller.abort();
    }
    activeRequests.delete(retiredGeneration);

    const credentialDeletion = enqueueCredentialOperation(() => options.credentials.delete());
    const cacheCleanup = clearProtectedCache(retiredGeneration);
    void credentialDeletion.catch(() => undefined);
    void cacheCleanup.catch(() => undefined);

    return { generation, credentialDeletion, cacheCleanup };
  }

  /** 结束认证失败的会话；删除失败时明确发布凭据存储不可用。 */
  async function invalidateSession(generation: number): Promise<void> {
    if (generation !== sessionGeneration) {
      return;
    }

    const transition = beginTransition({ status: 'anonymous' });
    const [deletion, cleanup] = await Promise.allSettled([
      transition.credentialDeletion,
      transition.cacheCleanup,
    ]);
    if (cleanup.status === 'rejected') {
      throw new AuthSessionError('cache-cleanup-failed');
    }
    if (deletion.status === 'rejected' && transition.generation === sessionGeneration) {
      internalState.set({ status: 'unavailable', reason: 'credential-storage' });
    }
  }

  /** 将当前代次标记为暂不可确认，同时保留尚可能有效的凭据。 */
  function markUnavailable(generation: number, reason: AuthUnavailableReason): void {
    if (generation === sessionGeneration) {
      internalState.set({ status: 'unavailable', reason });
    }
  }

  /** 执行一次刷新并在凭据持久化后更新内存令牌。 */
  async function refreshTokens(
    generation: number,
    currentTokens: CredentialPair,
  ): Promise<CredentialPair> {
    try {
      const rotatedTokens = await options.client.auth.refresh(currentTokens.refreshToken);
      if (generation !== sessionGeneration) {
        return rotatedTokens;
      }

      const persisted = await persistTokens(rotatedTokens, generation);
      if (persisted && generation === sessionGeneration) {
        publishTokens(rotatedTokens);
      }
      return rotatedTokens;
    } catch (error) {
      if (generation === sessionGeneration) {
        if (isInvalidAccessError(error)) {
          await invalidateSession(generation);
        } else {
          markUnavailable(
            generation,
            unavailableReason(error, 'refresh-indeterminate'),
          );
        }
      }
      throw error;
    }
  }

  /** 为同一会话的并发 401 共享唯一在途刷新。 */
  function getOrStartRefresh(generation: number): Promise<CredentialPair> {
    if (refreshFlight?.generation === generation) {
      return refreshFlight.promise;
    }
    if (!tokenPair) {
      return Promise.reject(new AuthSessionError('not-authenticated'));
    }

    const flight: RefreshFlight = {
      generation,
      promise: refreshTokens(generation, tokenPair),
    };
    refreshFlight = flight;
    const clearFlight = () => {
      if (refreshFlight === flight) {
        refreshFlight = null;
      }
    };
    void flight.promise.then(clearFlight, clearFlight);
    return flight.promise;
  }

  /** 登记并结束身份确认请求，使会话切换可中止尚未完成的确认。 */
  async function requestIdentity(generation: number): Promise<Rsp.Users.UserAccount> {
    const controller = new AbortController();
    const requests = registerRequest(generation, controller);
    try {
      const account = await options.client.users.getMe({ signal: controller.signal });
      if (generation !== sessionGeneration) {
        throw new AuthSessionError('session-changed');
      }
      return account;
    } finally {
      unregisterRequest(generation, controller, requests);
    }
  }

  /** 读取当前账号；只在必要时刷新一次，并在最终失败时退出对应会话。 */
  async function confirmIdentity(generation: number): Promise<Rsp.Users.UserAccount> {
    try {
      let account: Rsp.Users.UserAccount;
      try {
        account = await requestIdentity(generation);
      } catch (error) {
        if (!isInvalidAccessError(error)) {
          throw error;
        }
        await getOrStartRefresh(generation);
        if (generation !== sessionGeneration) {
          throw new AuthSessionError('session-changed');
        }
        account = await requestIdentity(generation);
      }

      if (generation !== sessionGeneration) {
        throw new AuthSessionError('session-changed');
      }
      internalState.set({
        status: 'authenticated',
        userId: account.userId,
        username: account.username,
      });
      return account;
    } catch (error) {
      if (generation === sessionGeneration) {
        if (isInvalidAccessError(error)) {
          await invalidateSession(generation);
        } else {
          markUnavailable(generation, unavailableReason(error, 'identity-unconfirmed'));
        }
      }
      throw error;
    }
  }

  /** 恢复一次当前作用域的令牌记录，并以服务端身份确认结果发布状态。 */
  async function restoreSession(generation: number): Promise<void> {
    let storedTokens: CredentialPair | null;
    try {
      storedTokens = await options.credentials.read();
    } catch {
      markUnavailable(generation, 'credential-storage');
      return;
    }

    if (generation !== sessionGeneration) {
      return;
    }
    if (!storedTokens) {
      internalState.set({ status: 'anonymous' });
      return;
    }

    publishTokens(storedTokens);
    try {
      await confirmIdentity(generation);
    } catch {
      // 状态和非敏感原因已由身份确认流程发布。
    }
  }

  /** 等待调用方或会话关闭信号，并登记本次受保护操作。 */
  function registerRequest(generation: number, controller: AbortController): Set<AbortController> {
    const requests = activeRequests.get(generation) ?? new Set<AbortController>();
    requests.add(controller);
    activeRequests.set(generation, requests);
    return requests;
  }

  /** 从旧代次的请求集合移除控制器。 */
  function unregisterRequest(
    generation: number,
    controller: AbortController,
    requests: Set<AbortController>,
  ): void {
    requests.delete(controller);
    if (requests.size === 0) {
      activeRequests.delete(generation);
    }
  }

  /** 执行一次受保护请求；仅认证失效触发共享刷新和一次重发。 */
  async function runProtected<TResponse>(
    operation: (requestOptions: CloudRequestOptions) => Promise<TResponse>,
    requestOptions: CloudRequestOptions = {},
    expectedGeneration = sessionGeneration,
  ): Promise<TResponse> {
    if (expectedGeneration !== sessionGeneration) {
      throw new AuthSessionError('session-changed');
    }
    if (internalState.get().status !== 'authenticated' || !tokenPair) {
      throw new AuthSessionError('not-authenticated');
    }

    const startingRevision = tokenRevision;
    const controller = new AbortController();
    const callerSignal = requestOptions.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    }
    const requests = registerRequest(expectedGeneration, controller);
    const mergedOptions = { ...requestOptions, signal: controller.signal };

    try {
      if (controller.signal.aborted) {
        throw new AuthSessionError('operation-cancelled');
      }

      try {
        const response = await operation(mergedOptions);
        if (expectedGeneration !== sessionGeneration) {
          throw new AuthSessionError('session-changed');
        }
        return response;
      } catch (error) {
        if (!isInvalidAccessError(error)) {
          throw error;
        }
        if (controller.signal.aborted) {
          throw new AuthSessionError('operation-cancelled');
        }
        if (expectedGeneration !== sessionGeneration) {
          throw new AuthSessionError('session-changed');
        }

        if (internalState.get().status !== 'authenticated' || !tokenPair) {
          throw new AuthSessionError('not-authenticated');
        }
        if (tokenRevision === startingRevision) {
          await waitWithAbort(getOrStartRefresh(expectedGeneration), controller.signal);
        }

        if (controller.signal.aborted) {
          throw new AuthSessionError('operation-cancelled');
        }
        if (expectedGeneration !== sessionGeneration) {
          throw new AuthSessionError('session-changed');
        }
        if (internalState.get().status !== 'authenticated' || !tokenPair) {
          throw new AuthSessionError('not-authenticated');
        }

        const response = await operation(mergedOptions);
        if (expectedGeneration !== sessionGeneration) {
          throw new AuthSessionError('session-changed');
        }
        return response;
      }
    } finally {
      callerSignal?.removeEventListener('abort', abortFromCaller);
      unregisterRequest(expectedGeneration, controller, requests);
    }
  }

  /** 等待凭据删除和缓存清理；存储失败不会伪装成匿名成功。 */
  async function finishTransition(transition: SessionTransition): Promise<void> {
    const [deletion, cleanup] = await Promise.allSettled([
      transition.credentialDeletion,
      transition.cacheCleanup,
    ]);
    if (cleanup.status === 'rejected') {
      throw new AuthSessionError('cache-cleanup-failed');
    }
    if (deletion.status === 'rejected') {
      if (transition.generation === sessionGeneration) {
        internalState.set({ status: 'unavailable', reason: 'credential-storage' });
      }
      throw new AuthSessionError('credential-storage-failed');
    }
  }

  /** 只在 SDK 模块首次初始化时读取凭据，不依赖 React 组件挂载。 */
  function restore(): Promise<void> {
    if (!restorePromise) {
      restorePromise = restoreSession(sessionGeneration);
    }
    return restorePromise;
  }

  /** 注册账号但不调用登录接口，也不改变认证状态。 */
  function register(
    credentials: Req.Auth.AccountCredentialsRequest,
  ): Promise<Rsp.Users.UserAccount> {
    return options.client.auth.register(credentials);
  }

  /** 清理旧作用域后登录，持久化并确认身份才发布已认证状态。 */
  async function signIn(
    credentials: Req.Auth.AccountCredentialsRequest,
  ): Promise<Rsp.Users.UserAccount> {
    const transition = beginTransition({ status: 'restoring' });
    try {
      await finishTransition(transition);
    } catch (error) {
      if (error instanceof AuthSessionError) {
        throw error;
      }
      throw new AuthSessionError('credential-storage-failed');
    }
    if (transition.generation !== sessionGeneration) {
      throw new AuthSessionError('session-changed');
    }

    try {
      const loginController = new AbortController();
      const loginRequests = registerRequest(transition.generation, loginController);
      let tokens: Rsp.Auth.TokenPair;
      try {
        tokens = await options.client.auth.login(credentials, { signal: loginController.signal });
      } finally {
        unregisterRequest(transition.generation, loginController, loginRequests);
      }
      if (transition.generation !== sessionGeneration) {
        throw new AuthSessionError('session-changed');
      }
      const persisted = await persistTokens(tokens, transition.generation);
      if (!persisted || transition.generation !== sessionGeneration) {
        throw new AuthSessionError('session-changed');
      }
      publishTokens(tokens);
      return await confirmIdentity(transition.generation);
    } catch (error) {
      if (transition.generation === sessionGeneration && internalState.get().status === 'restoring') {
        internalState.set({ status: 'anonymous' });
      }
      throw error;
    }
  }

  /** 本地立即结束旧会话，再尽力使用最新可取得的 Refresh 撤销远端令牌。 */
  async function signOut(): Promise<LogoutResult> {
    const retiredGeneration = sessionGeneration;
    const previousTokens = tokenPair;
    const pendingRefresh = refreshFlight?.generation === retiredGeneration
      ? refreshFlight.promise
      : null;
    const transition = beginTransition({ status: 'anonymous' });

    const revokeRemote = async (): Promise<LogoutResult['remoteRevocation']> => {
      let latestTokens = previousTokens;
      if (pendingRefresh) {
        try {
          latestTokens = await pendingRefresh;
        } catch {
          // 刷新结果不可用时仍以当前内存中最后一对凭据尽力撤销。
        }
      }
      if (!latestTokens) {
        return 'not-attempted';
      }
      try {
        await options.client.auth.logout(latestTokens.refreshToken);
        return 'confirmed';
      } catch {
        return 'unconfirmed';
      }
    };

    const [remoteRevocation, deletion, cleanup] = await Promise.all([
      revokeRemote(),
      transition.credentialDeletion.then(
        () => 'succeeded' as const,
        () => 'failed' as const,
      ),
      transition.cacheCleanup.then(
        () => 'succeeded' as const,
        () => 'failed' as const,
      ),
    ]);
    if (deletion === 'failed' && transition.generation === sessionGeneration) {
      internalState.set({ status: 'unavailable', reason: 'credential-storage' });
    }
    if (cleanup === 'failed') {
      throw new AuthSessionError('cache-cleanup-failed');
    }

    return { remoteRevocation, credentialDeletion: deletion };
  }

  return {
    state,
    restore,
    register,
    signIn,
    signOut,
    runProtected,
    getSessionGeneration: () => sessionGeneration,
    isAuthenticatedAt: (generation) =>
      generation === sessionGeneration && internalState.get().status === 'authenticated',
  };
}
