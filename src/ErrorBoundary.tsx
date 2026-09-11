import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TeamSpeakWeb] render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: '#e7eef7',
            background: '#0f1419',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: 18 }}>界面加载失败</h1>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              color: '#f07178',
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
          <p style={{ color: '#8b9aab', fontSize: 13 }}>
            请确认通过 <code>npm start</code> 打开 http://127.0.0.1:8080 ，而不是直接打开源码
            index.html。
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
