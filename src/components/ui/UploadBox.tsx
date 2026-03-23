import React from 'react';
import { ICONS } from '../../types';

interface UploadBoxProps {
  onUpload: (files: FileList | File[] | null) => void;
}

export const UploadBox: React.FC<UploadBoxProps> = ({ onUpload }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onUpload(event.target.files);
  };

  return (
    <div className="relative w-full h-64 border-2 border-dashed border-primary/20 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-primary/5 group hover:border-primary/40 transition-all">
      <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform text-primary">
        <ICONS.Camera size={32} />
      </div>
      <h3 className="text-lg font-bold">Upload Clothing Images</h3>
      <p className="text-sm text-slate-500 mt-1">Drag & drop or click to select files</p>
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
};
