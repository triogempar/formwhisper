/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __FORMWHISPER_CONFIG__: import('./lib/config').FwConfigFile | null

interface LanguageModelDownloadEvent extends Event {
  loaded: number
}

interface LanguageModelMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: LanguageModelDownloadEvent) => void): void
}

interface LanguageModelSession {
  destroy?: () => void
}

interface LanguageModelCreateOptions {
  monitor?: (monitor: LanguageModelMonitor) => void
  expectedInputs?: { type: string; languages?: string[] }[]
  expectedOutputs?: { type: string; languages?: string[] }[]
}

interface LanguageModelNamespace {
  availability(options?: LanguageModelCreateOptions): Promise<string>
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
}

interface Window {
  LanguageModel?: LanguageModelNamespace
  __FW_FAKE_CAPTURE__?: string
}
