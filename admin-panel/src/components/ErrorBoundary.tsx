import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.pageName || 'Page'} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="页面加载失败"
          subTitle={this.state.error?.message || '发生未知错误，请刷新页面重试'}
          extra={
            <Button
              type="primary"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
              }}
            >
              重试
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
