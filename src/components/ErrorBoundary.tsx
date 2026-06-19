import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("VANTA error boundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel">
          <div className="scroll">
            <div className="empty">
              <div className="t" style={{ fontSize: 15, color: "var(--bad)" }}>
                Something went wrong
              </div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 8, maxWidth: 400 }}>
                {this.state.error?.message || "An unexpected error occurred."}
              </div>
              <button
                className="btn"
                style={{ marginTop: 16 }}
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
