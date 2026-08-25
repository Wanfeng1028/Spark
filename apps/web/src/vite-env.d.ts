/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 1 = MockTransport（无后端开发）；缺省/0 = HttpTransport */
  readonly VITE_SPARK_MOCK?: string
  /** API 基址覆盖（缺省同源——dev 走 vite proxy → 127.0.0.1:4318） */
  readonly VITE_SPARK_API?: string
}
