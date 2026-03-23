import React from 'react';
import { ICONS } from '../../types';

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Search...", onSearch }) => {
  return (
    <div className="relative w-full max-w-xl">
      <ICONS.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 size-4" />
      <input
        type="text"
        placeholder={placeholder}
        onChange={(e) => onSearch?.(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-6 text-sm focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-600"
      />
    </div>
  );
};
