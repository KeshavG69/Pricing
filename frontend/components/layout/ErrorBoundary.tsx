'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import Button from '../ui/Button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
          <div className="max-w-md w-full bg-slate-900/30 border border-slate-800 rounded-lg p-8 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-50 mb-2">
                Something went wrong
              </h2>
              <p className="text-slate-400 text-sm">
                An unexpected error occurred. Please try refreshing the page.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left mb-6">
                <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 mb-2">
                  Error details
                </summary>
                <div className="bg-slate-950 rounded p-3 text-xs text-red-400 font-mono overflow-auto max-h-40">
                  {this.state.error.toString()}
                </div>
              </details>
            )}

            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={() => window.location.reload()}
                className="w-full"
              >
                Reload page
              </Button>
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="w-full"
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
