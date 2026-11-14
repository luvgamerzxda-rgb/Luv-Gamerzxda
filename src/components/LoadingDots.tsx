import React from 'react';
import { Globe, Search, BookOpen, Sparkles, Brain } from 'lucide-react';

interface LoadingDotsProps {
  label?: string;
  status?: 'thinking' | 'searching' | 'reading' | 'preparing';
  query?: string;
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  label = 'Thinking',
  status = 'thinking',
  query,
}) => {
  const getIcon = () => {
    switch (status) {
      case 'searching':
        return <Globe className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />;
      case 'reading':
        return <BookOpen className="w-3.5 h-3.5 text-sky-400 animate-pulse" />;
      case 'preparing':
        return <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-bounce" />;
      default:
        return <Brain className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />;
    }
  };

  const getBadgeColor = () => {
    switch (status) {
      case 'searching':
        return 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300';
      case 'reading':
        return 'bg-sky-950/60 border-sky-500/30 text-sky-300';
      case 'preparing':
        return 'bg-indigo-950/60 border-indigo-500/30 text-indigo-300';
      default:
        return 'bg-[#0b122e] border-cyan-500/20 text-cyan-200';
    }
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border ${getBadgeColor()} text-xs font-medium backdrop-blur-xs transition-all shadow-xs`}>
        <div className="flex items-center justify-center">
          {getIcon()}
        </div>
        <span className="tracking-wide">
          {label}...
        </span>
        <div className="flex items-center gap-1 ml-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 animate-ping" style={{ animationDuration: '1.2s' }}></span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"></span>
        </div>
      </div>

      {query && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 pl-2">
          <Search className="w-3 h-3 text-cyan-400/70" />
          <span>Searching: <span className="text-zinc-200 font-mono italic">"{query}"</span></span>
        </div>
      )}
    </div>
  );
};
