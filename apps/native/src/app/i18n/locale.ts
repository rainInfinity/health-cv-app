/** 固定当前版本有效语言，旧偏好与系统语言不再切换本版界面。 */

import { atom, readonlyType } from 'nanostores'

import type { AppLocale } from './resolveLocale'

const publishedLocale = atom<AppLocale>('zh-CN')

/** 本版唯一开放的界面语言；通用偏好解析工具仍独立保留。 */
export const currentLocale = readonlyType(publishedLocale)
