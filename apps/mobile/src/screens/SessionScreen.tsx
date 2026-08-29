/**
 * 会话页（骨架壳——工单 9.2：占位消息流区域，内容工单 9.3 填）。
 * 页头带返回圆钮（J.1）；标题 17 semibold；空态两行式纯排版（J.4）。
 */
import { StyleSheet, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useTheme } from '../theme/use-theme'
import { EmptyState, ScreenHeader } from '../components/ui'
import type { SessionsStackParamList } from '../navigation/params'

export function SessionScreen() {
  const t = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<SessionsStackParamList>>()
  const route = useRoute<RouteProp<SessionsStackParamList, 'Session'>>()
  const { sessionId, title } = route.params

  return (
    <View style={[styles.screen, { backgroundColor: t.pageBackground }]}>
      <ScreenHeader
        title={title !== '' ? title : '新会话'}
        leftIcon="chevron-left"
        leftLabel="返回会话列表"
        onLeftPress={() => navigation.goBack()}
      />
      {/* 消息流占位区（工单 9.3：投影渲染 user 胶囊 / assistant 全宽纯文本 / 工具卡） */}
      <View style={styles.stream} accessibilityLabel={`会话 ${sessionId} 消息流占位`}>
        <EmptyState
          title="消息流建设中"
          detail="会话内容将在下一工单接入，当前仅提供骨架"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stream: {
    flex: 1,
    paddingHorizontal: 16,
  },
})
