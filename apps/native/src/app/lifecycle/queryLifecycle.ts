/** 将应用前台与网络状态映射到 React Query 的全局生命周期管理器。 */

import { focusManager, onlineManager } from '@tanstack/react-query';

interface NetworkState {
  /** 网络连接状态；null 表示尚未确认。 */
  isConnected: boolean | null;
  /** 互联网可达状态；null 表示尚未确认。 */
  isInternetReachable: boolean | null;
}

interface QueryLifecycleSources {
  /** 安装时的原生应用状态。 */
  currentAppState: string | null;
  /** 订阅共享的原生应用状态事件。 */
  subscribeToAppState(listener: (state: string) => void): () => void;
  /** 订阅 NetInfo 状态并返回释放操作。 */
  subscribeToNetwork(listener: (state: NetworkState) => void): () => void;
}

/** 安装前台／网络事件桥接，并返回幂等清理操作。 */
export function installQueryLifecycle(sources: QueryLifecycleSources): () => void {
  focusManager.setFocused(sources.currentAppState === 'active');
  focusManager.setEventListener((setFocused) =>
    sources.subscribeToAppState((state) => setFocused(state === 'active')),
  );
  onlineManager.setEventListener((setOnline) =>
    sources.subscribeToNetwork((state) => {
      if (state.isConnected === false || state.isInternetReachable === false) {
        setOnline(false);
      } else if (state.isConnected === true || state.isInternetReachable === true) {
        setOnline(true);
      }
    }),
  );

  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    focusManager.setEventListener(() => () => {});
    onlineManager.setEventListener(() => () => {});
  };
}
