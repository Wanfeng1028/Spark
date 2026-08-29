/** 导航参数类型（单栈+抽屉，无 tab bar——J.1）：根抽屉两页 + 会话栈两屏 */
import type { NavigatorScreenParams } from '@react-navigation/native'

/** 会话栈：列表 → 会话页 */
export type SessionsStackParamList = {
  SessionList: undefined
  Session: { sessionId: string; title: string }
}

/** 根抽屉：会话（嵌套栈）/ 设置 */
export type DrawerParamList = {
  Sessions: NavigatorScreenParams<SessionsStackParamList> | undefined
  Settings: undefined
}
