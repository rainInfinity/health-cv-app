/** 将原生应用状态变化分发给共享订阅者，并在无人订阅时释放监听。 */

interface NativeAppStateSource<TState extends string> {
  /** 注册原生状态变化监听，并返回释放操作。 */
  addEventListener(event: 'change', listener: (state: TState) => void): { remove(): void };
}

interface AppStateEvents<TState extends string> {
  /** 订阅所有应用状态变化。 */
  subscribeToAppState(listener: (state: TState) => void): () => void;
  /** 订阅应用进入前台事件。 */
  subscribeToAppForeground(listener: () => void): () => void;
}

/** 创建单一底层原生监听供语言与应用生命周期共同订阅。 */
export function createAppStateEvents<TState extends string>(
  source: NativeAppStateSource<TState>,
): AppStateEvents<TState> {
  const listeners = new Set<(state: TState) => void>();
  let subscription: { remove(): void } | null = null;

  const subscribeToAppState = (listener: (state: TState) => void): (() => void) => {
    listeners.add(listener);

    if (subscription === null) {
      subscription = source.addEventListener('change', (state) => {
        listeners.forEach((notify) => notify(state));
      });
    }

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);

      if (listeners.size === 0) {
        subscription?.remove();
        subscription = null;
      }
    };
  };

  return {
    subscribeToAppState,
    subscribeToAppForeground(listener) {
      return subscribeToAppState((state) => {
        if (state === 'active') listener();
      });
    },
  };
}
