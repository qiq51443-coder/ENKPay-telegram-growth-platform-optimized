import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt, onClose }) => {
  const [scale, setScale] = useState(1);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={handleZoomOut}
          className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      <div className="overflow-auto max-w-full max-h-full p-4">
        <img
          src={src}
          alt={alt}
          style={{ transform: `scale(${scale})`, transition: 'transform 0.2s' }}
          className="max-w-none"
        />
      </div>
    </div>
  );
};
