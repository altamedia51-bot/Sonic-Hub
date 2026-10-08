import React, { useState } from 'react';
import { 
  Music, 
  Disc, 
  LayoutDashboard, 
  ShieldAlert, 
  Coins, 
  LogOut, 
  User as UserIcon, 
  Sparkles,
  Sliders
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openAuthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, openAuthModal }) => {
  const { user, isAdmin, credits, logout } = useAuth();
  const [userDropdown, setUserDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo */}
        <div 
          onClick={() => setCurrentTab('studio')}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-900/20 group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
            <Music className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold tracking-tight text-white text-base sm:text-lg font-mono whitespace-nowrap">
                SONIC HUB <span className="bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">AI</span>
              </span>
              <span className="hidden sm:inline-flex text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 whitespace-nowrap">
                Suno V6
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-zinc-400 -mt-0.5 truncate">Official platform Engine ai</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setCurrentTab('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'studio'
                ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Studio / Create
          </button>

          <button
            onClick={() => setCurrentTab('library')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'library'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            My Songs
          </button>

          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'dashboard'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>

          {isAdmin && (
            <button
              onClick={() => setCurrentTab('admin')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentTab === 'admin'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50 shadow-sm'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/30'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Admin Portal
            </button>
          )}

          <button
            onClick={() => setCurrentTab('demo')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'demo'
                ? 'bg-zinc-800 text-zinc-300'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            UI Demo
          </button>
        </nav>

        {/* User / Credits / Auth Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          
          {/* Credits Balance Pill */}
          <div 
            onClick={() => setCurrentTab('dashboard')}
            title="Your Generation Credits"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-amber-500/50 transition-colors flex-shrink-0"
          >
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Coins className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-amber-300 font-mono">{credits.toLocaleString()}</span>
              <span className="hidden sm:inline text-[10px] text-zinc-400 uppercase font-medium">Credits</span>
            </div>
          </div>

          {/* User Profile / Menu */}
          {user ? (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setUserDropdown(!userDropdown)}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
              >
                <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-xs text-white">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                </div>
                {isAdmin && (
                  <span className="hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/40">
                    ADMIN
                  </span>
                )}
              </button>

              {userDropdown && (
                <div 
                  onMouseLeave={() => setUserDropdown(false)}
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-4 py-2 border-b border-zinc-800">
                    <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { setCurrentTab('dashboard'); setUserDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-zinc-400" />
                      Dashboard & Usage
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setCurrentTab('admin'); setUserDropdown(false); }}
                        className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        Admin Mission Control
                      </button>
                    )}
                  </div>

                  <div className="border-t border-zinc-800 pt-1">
                    <button
                      onClick={() => { logout(); setUserDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openAuthModal}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition"
            >
              <UserIcon className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
