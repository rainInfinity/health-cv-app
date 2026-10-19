/** 在注册根组件前初始化应用服务并挂载 Expo 应用。 */
import './src/app/bootstrap';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
