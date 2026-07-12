import { Component, type ReactNode } from 'react';

type State = { hasError: boolean; message: string };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch() {
    // Intentionally avoid exposing stack traces to UI.
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel" role="alert">
          <h2>Dashboard UI Error</h2>
          <p>The page encountered a rendering issue. Refresh and retry.</p>
          <p className="muted">Error category: UI_RENDER_FAILURE</p>
        </section>
      );
    }

    return this.props.children;
  }
}
