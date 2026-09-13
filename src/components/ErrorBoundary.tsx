import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Masthead } from "./Masthead";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error caught by boundary:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen">
        <Masthead />
        <div className="container-prose py-20 text-center">
          <h1 className="font-display text-3xl">Something went wrong.</h1>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg break-words">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-center">
            <button onClick={this.reset} className="btn-secondary">
              Try again
            </button>
            <Link to="/" onClick={this.reset} className="btn-primary">
              Return to the list
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
