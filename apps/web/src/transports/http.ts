/**
 * HttpTransport 内核已下沉 @spark/protocol（工单 8.1 / ADR D22：web 与 cli 共用）。
 * 本文件保留 web 内既有导入面（`./http`）的再导出；环境缺省基址由 context 构造时注入。
 */
export { HttpTransport } from '@spark/protocol'
export type { HttpConnectionStatus, HttpTransportOptions } from '@spark/protocol'
