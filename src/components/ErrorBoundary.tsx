import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Masthead } from "./Masthead";
import { isStaleBuildError, reloadToCurrentBuild } from "@/lib/sw-update";

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
    const { error } = this.state;
    if (!error) return this.props.children;

    // A tab left open across a deploy reaching for code that no longer exists.
    // Retrying can never work — the URL is gone — so the only way out is a
    // reload onto the current build, and it gets a button rather than an
    // instruction.
    if (isStaleBuildError(error)) {
      return (
        <div className="min-h-screen">
          <Masthead />
          <div className="container-prose py-20 text-center">
            <h1 className="font-display text-3xl">The app has been updated.</h1>
            <p className="text-muted-foreground mt-3 text-base sm:text-lg">
              This tab is still running an older version. Reload to pick up the current one —
              nothing on the list is affected.
            </p>
            <div className="mt-8">
              <button onClick={reloadToCurrentBuild} className="btn-primary">
                Reload the app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen">
        <Masthead />
        <div className="container-prose py-20 text-center">
          <h1 className="font-display text-3xl">Something went wrong.</h1>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg break-words">
            {error.message || "An unexpected error occurred."}
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
