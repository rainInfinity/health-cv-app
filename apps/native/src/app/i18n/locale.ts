/** 从持久语言选择与当前系统语言列表派生最终界面语言。 */

import { getLocales } from 'expo-localization'
import { subscribeToAppForeground } from '../lifecycle/foreground'
import { languagePreference } from '../preferences'
import { createLocaleState } from './localeState'

const localeState = createLocaleState(languagePreference, getLocales)

/** 当前界面语言；不独立写入，始终由偏好和设备语言列表计算。 */
export const currentLocale = localeState.currentLocale

subscribeToAppForeground(localeState.refreshSystemLocales)

