import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    const { children } = (this as any).props;

    if (hasError) {
      let errorMessage = "문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
      
      try {
        if (error && error.message) {
          const parsedError = JSON.parse(error.message);
          if (parsedError.error && parsedError.error.includes("insufficient permissions")) {
            errorMessage = "권한이 없거나 데이터베이스 설정이 필요합니다.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#FBFBFA] p-8 text-center">
          <div className="bg-red-50 p-6 rounded-[32px] border border-red-100 max-w-md">
            <AlertCircle className="text-red-500 w-12 h-12 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[#4A3728] mb-2">오류가 발생했습니다</h2>
            <p className="text-[#8B7E74] mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-[#8B5E3C] text-white rounded-xl font-bold"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
