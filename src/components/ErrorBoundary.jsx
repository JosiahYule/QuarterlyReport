import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[Section error]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="section wrap" role="alert" aria-live="assertive">
          <div className="error-section">
            <p style={{ color: "var(--ink-3)", fontSize: 14 }}>
              This section couldn't be displayed.
            </p>
            <button
              className="error-retry-btn"
              onClick={() => this.setState({ hasError: false })}
            >
              Retry
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
