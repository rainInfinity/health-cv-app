/** 先注册偏好存储并创建派生 locale，再加载并注册应用根组件。 */
import '@/app/preferences';
import '@/app/i18n/locale';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
