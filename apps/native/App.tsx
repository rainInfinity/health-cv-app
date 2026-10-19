/** 保留 Hello World 基线界面；启动入口在挂载前初始化应用服务。 */

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/** 呈现用于验证 Native 宿主的最小页面。 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text>Hello World</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
