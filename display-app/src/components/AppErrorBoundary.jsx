import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Display UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="startup-error-screen">
          <div className="startup-error-card">
            <h1 className="startup-error-title">Display Error</h1>
            <p className="startup-error-message">Something went wrong loading the player.</p>
            <pre className="startup-error-details">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button type="button" className="startup-error-retry" onClick={() => window.location.reload()}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
