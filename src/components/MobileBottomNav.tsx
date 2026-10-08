import React from 'react';
import { 
  Sparkles, 
  Disc, 
  LayoutDashboard, 
  ShieldAlert 
} from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isAdmin: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  isAdmin
}) => {
  return (
    <nav 
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 px-3 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.7)]"
    >
      {/* Studio Tab */}
      <button
        type="button"
        onClick={() => setCurrentTab('studio')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-200 active:scale-90 ${
          currentTab === 'studio'
            ? 'text-amber-400 bg-amber-500/15 font-bold shadow-inner'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 mb-0.5" />
          {currentTab === 'studio' && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-75" />
          )}
        </div>
        <span className="text-[11px] font-medium tracking-tight">Studio</span>
      </button>

      {/* Songs / Library Tab */}
      <button
        type="button"
        onClick={() => setCurrentTab('library')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-200 active:scale-90 ${
          currentTab === 'library'
            ? 'text-amber-400 bg-amber-500/15 font-bold shadow-inner'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Disc className={`w-5 h-5 mb-0.5 ${currentTab === 'library' ? 'animate-spin-slow' : ''}`} />
        <span className="text-[11px] font-medium tracking-tight">Songs</span>
      </button>

      {/* Dashboard Tab */}
      <button
        type="button"
        onClick={() => setCurrentTab('dashboard')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-200 active:scale-90 ${
          currentTab === 'dashboard'
            ? 'text-amber-400 bg-amber-500/15 font-bold shadow-inner'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span className="text-[11px] font-medium tracking-tight">Dashboard</span>
      </button>

      {/* Admin Tab (If Admin) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => setCurrentTab('admin')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-200 active:scale-90 ${
            currentTab === 'admin'
              ? 'text-rose-400 bg-rose-500/15 font-bold shadow-inner'
              : 'text-zinc-400 hover:text-rose-300'
          }`}
        >
          <ShieldAlert className="w-5 h-5 mb-0.5 text-rose-400" />
          <span className="text-[11px] font-medium tracking-tight">Admin</span>
        </button>
      )}
    </nav>
  );
};
