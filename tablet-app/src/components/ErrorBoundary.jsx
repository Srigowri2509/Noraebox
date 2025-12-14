import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0B0F17] text-white p-8">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold mb-4 text-red-400">⚠️ Application Error</h1>
            <p className="text-lg mb-4">{this.state.error?.message || "An unexpected error occurred"}</p>
            <pre className="bg-black/50 p-4 rounded text-sm overflow-auto max-h-96 mb-4">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-2 px-6 rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

