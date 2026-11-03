/** 提供健康、功能、历史拦截、用户和开发五个底部入口。 */

import { useStore } from '@nanostores/react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Pressable } from 'react-native'
import { Code2, House, LayoutGrid, UserRound } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'
import { requestAcquisitionLeave } from '@/app/navigation/acquisitionNavigationGuard'
import { productNavigationMessages } from '@/app/i18n/productNavigationMessages'
import type { ProductTabParamList } from '@/app/navigation/types'
import { PRODUCT_TAB_CONFIGURATION } from './config'
import { DevNavigator } from '@/app/navigation/DevNavigator'
import { HomeScreen } from '@/pages/home/HomeScreen'
import { FeaturesScreen } from '@/pages/features/FeaturesScreen'
import { HistoryUnavailableScreen } from '@/pages/history/HistoryUnavailableScreen'
import { historyMessages } from '@/pages/history/historyMessages'
import { UserScreen } from '@/pages/user/UserScreen'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { useFeedback } from '@/shared/components/FeedbackHost'

const Tab = createBottomTabNavigator<ProductTabParamList>()

/** 展示五个页面 Tab，并把历史 Tab 转为不切页的统一说明弹窗。 */
export function ProductTabs() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const labels = useStore(productNavigationMessages)
  const historyCopy = useStore(historyMessages)
  const sharedCopy = useStore(feedbackMessages)
  const { showModal } = useFeedback()

  /** 历史暂未开放；点击不选中 Tab、不触发数据请求。 */
  const showUnavailableHistory = () => {
    showModal({
      title: historyCopy.title,
      message: historyCopy.message,
      closeLabel: sharedCopy.dismiss,
      actions: [{ label: sharedCopy.dismiss, primary: true }],
    })
  }

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
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
        tabBarInactiveTintColor: theme.colors.text.secondary,
        tabBarLabelVisibilityMode: 'labeled',
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: theme.colors.surface.default,
          borderTopColor: theme.colors.border.default,
          height: theme.icon.touchTarget + theme.spacing.md + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: theme.typography.roles.caption.fontSize },
      }}
      screenListeners={({ route, navigation }) => ({
        tabPress: (event) => {
          if (route.name === 'History') {
            event.preventDefault()
            showUnavailableHistory()
            return
          }
          if (route.name === 'Dev') return
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
          title: labels.health,
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Features"
        component={FeaturesScreen}
        options={{
          title: labels.features,
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryUnavailableScreen}
        options={{
          title: labels.history,
          tabBarIcon: ({ color, size }) => (
            <Svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              accessible={false}
            >
              <Path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2" />
            </Svg>
          ),
        }}
      />
      <Tab.Screen
        name="User"
        component={UserScreen}
        options={{
          title: labels.user,
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
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
