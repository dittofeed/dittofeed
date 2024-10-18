import React, { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

interface ErrorBoundaryProps {
  message?: string;
  children: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: props.message };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { message } = this.state;
    const messages = ["client error occurred"];
    if (message) {
      messages.push(message);
    }
    messages.push(":");
    console.error(messages.join(" "), error, errorInfo);
  }

  override render(): ReactNode {
    const { children } = this.props;
    const { hasError } = this.state;
    if (hasError) {
      return <h1>An error occurred while rendering the component</h1>;
    }

    return children;
  }
}

export default ErrorBoundary;
