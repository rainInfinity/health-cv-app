/** 提供健康、功能、历史、用户和开发五个底部入口。 */

import { useStore } from '@nanostores/react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Image, Pressable, Text, View } from 'react-native'
import { Code2, ProductTabIcon } from '@/shared/graphics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'
import { requestAcquisitionLeave } from '@/app/navigation/acquisitionNavigationGuard'
import { requestRPPGLeave } from '@/app/navigation/rppgNavigationGuard'
import { productNavigationMessages } from '@/app/i18n/productNavigationMessages'
import type { ProductTabParamList } from '@/app/navigation/types'
import { OPERATION_PHOTOS } from '@/app/measurement/operationPhotos'
import { PRODUCT_TAB_CONFIGURATION } from './config'
import { DevNavigator } from '@/app/navigation/DevNavigator'
import { HomeScreen } from '@/pages/home/HomeScreen'
import { FeaturesScreen } from '@/pages/features/FeaturesScreen'
import { HistoryScreen } from '@/pages/history/HistoryScreen'
import { UserScreen } from '@/pages/user/UserScreen'

const Tab = createBottomTabNavigator<ProductTabParamList>()
const CARD_PHOTO_SOURCES = Object.values(OPERATION_PHOTOS).map((photos) => photos.card)

/** 产品页共享同一 Tab 容器，保留筛选及既有采集资源交接。 */
export function ProductTabs() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const labels = useStore(productNavigationMessages)

  return (
    <Tab.Navigator
      initialRouteName="Home"
      // React 预挂载不等于原生视图已布局；保留页面以提前处理安全区和尺寸。
      detachInactiveScreens={false}
      layout={({ children }) => (
        <View style={{ flex: 1 }}>
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          >
            {/* 原生 Image 在附着时解码；SVG Image 要到首次绘制才加载，二者共用图片缓存。 */}
            {CARD_PHOTO_SOURCES.map((source) => (
              <Image key={source} source={source} resizeMethod="none" fadeDuration={0} style={{ width: 1, height: 1 }} />
            ))}
          </View>
          {children}
        </View>
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
        // 取消平台按压波纹；选中色仍表示当前页面。
        tabBarButton: ({
          href: _href,
          ref: _ref,
          android_ripple: _androidRipple,
          hoverEffect: _hoverEffect,
          pressOpacity: _pressOpacity,
          ...buttonProps
        }) => <Pressable {...buttonProps} />,
        tabBarActiveTintColor: route.name === 'Dev' ? undefined : theme.colors.brand.primary,
        tabBarInactiveTintColor: route.name === 'Dev' ? theme.colors.text.secondary : theme.colors.text.muted,
        tabBarLabelVisibilityMode: 'labeled',
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: route.name === 'Dev' ? undefined : ({ focused, children }) => (
          <Text
            style={{
              color: focused ? theme.colors.brand.primary : theme.colors.text.muted,
              fontSize: theme.typography.roles.caption.fontSize,
              fontWeight: focused ? theme.typography.weight.semibold : theme.typography.weight.regular,
            }}
          >
            {children}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: theme.colors.surface.default,
          borderTopColor: theme.colors.border.default,
          height: theme.icon.touchTarget + theme.spacing.md + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: theme.typography.roles.caption.fontSize },
      })}
      screenListeners={({ route, navigation }) => ({
        tabPress: (event) => {
          if (route.name === 'Dev') return
          if (requestRPPGLeave(() => navigation.navigate(route.name))) {
            event.preventDefault()
            return
          }
          if (requestAcquisitionLeave(() => navigation.navigate(route.name))) {
            event.preventDefault()
          }
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          lazy: false,
          title: labels.health,
          tabBarIcon: ({ color, focused }) => (
            <ProductTabIcon kind="home" selected={focused} color={color} size={theme.icon.default} />
          ),
        }}
      />
      <Tab.Screen
        name="Features"
        component={FeaturesScreen}
        options={{
          lazy: false,
          title: labels.features,
          tabBarIcon: ({ color, focused }) => (
            <ProductTabIcon kind="features" selected={focused} color={color} size={theme.icon.default} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: labels.history,
          tabBarIcon: ({ color, focused }) => (
            <ProductTabIcon kind="history" selected={focused} color={color} size={theme.icon.default} />
          ),
        }}
      />
      <Tab.Screen
        name="User"
        component={UserScreen}
        options={{
          lazy: false,
          title: labels.user,
          tabBarIcon: ({ color, focused }) => (
            <ProductTabIcon kind="user" selected={focused} color={color} size={theme.icon.default} />
          ),
        }}
      />
      {PRODUCT_TAB_CONFIGURATION.developerTabVisible && (
        <Tab.Screen
          name="Dev"
          component={DevNavigator}
          options={{
            title: labels.dev,
            tabBarIcon: ({ color, size }) => <Code2 color={color} size={size} />,
          }}
        />
      )}
    </Tab.Navigator>
  )
}
