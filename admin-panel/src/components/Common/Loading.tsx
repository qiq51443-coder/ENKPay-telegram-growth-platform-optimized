import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  fullscreen?: boolean;
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ fullscreen = false, message }) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      {message && <p className="text-gray-600">{message}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return content;
};
