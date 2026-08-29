// defineAppConfig 为 Taro 全局类型（与页面 definePageConfig 同口径，无需 import）
export default defineAppConfig({
  /**
   * 页面栈（工单 9.4）：会话列表（根页）→ 会话页 / 设置页，小程序原生页面栈导航。
   * 形态收敛说明（§13.J.1）：RN 端的抽屉导航收敛为原生栈——列表页头部直达设置，
   * 无 tab bar（J.1 纪律保持）。
   */
  pages: ['pages/sessions/index', 'pages/session/index', 'pages/settings/index'],
  window: {
    navigationBarTitleText: 'Spark',
    navigationBarBackgroundColor: '#F7F7F7',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F7F7F7',
    backgroundTextStyle: 'dark',
  },
})
