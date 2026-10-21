/** 提供主动 PPG、独立传感器与被动录像的 Android 验证入口。 */

import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { AcquisitionScreen } from './src/features/acquisition/AcquisitionScreen'
import { PassiveCaptureScreen } from './src/features/acquisition/PassiveCaptureScreen'
import { SensorCaptureScreen } from './src/features/sensors/SensorCaptureScreen'

/** 在主动页面与被动服务状态页面间切换，不自动启动任一相机。 */
export default function App() {
  const [screen, setScreen] = useState<'active' | 'passive' | 'sensors'>('active')
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url === 'healthcvapp://passive-capture') setScreen('passive')
    })
    void Linking.getInitialURL().then((url) => {
      if (url === 'healthcvapp://passive-capture') setScreen('passive')
    })
    return () => subscription.remove()
  }, [])


  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.tabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: screen === 'active' }}
            onPress={() => setScreen('active')}
            style={[styles.tab, screen === 'active' && styles.selectedTab]}
          >
            <Text style={[styles.tabText, screen === 'active' && styles.selectedTabText]}>主动 PPG</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: screen === 'passive' }}
            onPress={() => setScreen('passive')}
            style={[styles.tab, screen === 'passive' && styles.selectedTab]}
          >
            <Text style={[styles.tabText, screen === 'passive' && styles.selectedTabText]}>无扰式被动采集</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: screen === 'sensors' }}
            onPress={() => setScreen('sensors')}
            style={[styles.tab, screen === 'sensors' && styles.selectedTab]}
          >
            <Text style={[styles.tabText, screen === 'sensors' && styles.selectedTabText]}>传感器</Text>
          </Pressable>
        </View>
        <View style={styles.page}>
          {screen === 'active' ? <AcquisitionScreen /> : screen === 'passive' ? <PassiveCaptureScreen /> : <SensorCaptureScreen />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d0d5dd' },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#f2f4f7' },
  selectedTab: { backgroundColor: '#155eef' },
  tabText: { color: '#344054', fontSize: 14, fontWeight: '600' },
  selectedTabText: { color: '#fff' },
  page: { flex: 1 },
})
