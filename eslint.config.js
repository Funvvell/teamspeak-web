import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'gateway-data/**', 'coverage/**', '*.log', '.worktrees/**', 'test-results/**', 'playwright-report/**', 'e2e/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 项目代码保留少量 any（WebSocket 消息等动态结构），由 review 判定可控
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      // react-refresh 对单文件组件的限制与当前结构不兼容，仅保留 hooks 检查
      'react-refresh/only-export-components': 'off',
      // 初始化/派生状态的有意 effect 同步（默认值、跟随外部配置）——规则为性能建议而非正确性
      'react-hooks/set-state-in-effect': 'off',
      // refs/immutability 为 React 19 实验性激进规则，对既有稳定代码噪音过大，关闭（保留 exhaustive-deps 核心检查）
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  {
    // 脚本与网关注入 node 全局
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // 音频 worklet 专用全局
    files: ['public/capture-processor.js', 'public/aec-processor.js', 'public/rnnoise-worklet.js'],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
      },
    },
  },
)
