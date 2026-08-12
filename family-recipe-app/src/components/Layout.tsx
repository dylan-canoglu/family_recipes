import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ChefHat, Search, Compass, Heart,
  LayoutDashboard, PlusCircle, LogIn, LogOut,
  Menu, X, ChevronLeft, ChevronRight, ShieldCheck, CalendarDays,
  House as HomeIcon
} from 'lucide-react';

// `/` would match startsWith for every route, so it needs an exact test.
const isRouteActive = (pathname: string, path: string) =>
  path === '/' ? pathname === '/' : pathname.startsWith(path);

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop collapse state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile overlay state

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Home', path: '/', icon: HomeIcon },
    { name: 'Search Vault', path: '/recipes', icon: Search },
    { name: 'Discovery', path: '/discovery', icon: Compass },
    { name: 'Meal Planner', path: '/planner', icon: CalendarDays },
    { name: 'Favorites', path: '/favorites', icon: Heart },
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Add Recipe', path: '/add', icon: PlusCircle },
    ...(isAdmin ? [{ name: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];

  // Account controls. Rendered in both the desktop sidebar and the mobile
  // menu -- it used to live only in the desktop sidebar, which is hidden below
  // the md breakpoint, leaving phones with no way to sign in or out at all.
  // `showLabels` is false only for the collapsed desktop sidebar.
  const AuthSection = ({ showLabels = true }: { showLabels?: boolean }) => (
    <div className="p-4 border-t border-slate-100">
      {user ? (
        <div className={`flex flex-col ${!showLabels && 'items-center'}`}>
          {showLabels && <span className="text-xs text-slate-400 mb-2 truncate">{user.email}</span>}
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 p-3 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full ${!showLabels && 'justify-center'}`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {showLabels && <span>Sign Out</span>}
          </button>
        </div>
      ) : (
        <Link
          to="/auth"
          onClick={() => setIsMobileMenuOpen(false)}
          className={`flex items-center gap-3 p-3 rounded-xl text-orange-600 bg-orange-50 hover:bg-orange-100 transition-all w-full font-semibold ${!showLabels && 'justify-center'}`}
        >
          <LogIn className="w-5 h-5 flex-shrink-0" />
          {showLabels && <span>Sign In</span>}
        </Link>
      )}
    </div>
  );

  const NavLinks = () => (
    <nav className="flex flex-col gap-2 p-4">
      {navItems.map((item) => {
        const isActive = isRouteActive(location.pathname, item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            to={item.path}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              isActive 
                ? 'bg-orange-100 text-orange-700 font-semibold' 
                : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {/* Hide text if sidebar is collapsed on desktop */}
            <span className={`${!isSidebarOpen && 'hidden md:hidden'} transition-all`}>
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  // The four destinations worth a permanent thumb target on a phone. "More"
  // opens the existing overlay, which already lists everything else along with
  // the account controls.
  const tabs = [
    { name: 'Home', path: '/', icon: HomeIcon },
    { name: 'Vault', path: '/recipes', icon: Search },
    { name: 'Planner', path: '/planner', icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* Mobile Header & Hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-header-safe pt-safe bg-white border-b border-slate-200 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-orange-600">
          <ChefHat className="w-8 h-8" />
          <span className="font-bold text-xl">The Vault</span>
        </div>
        {/* Opening the menu is the tab bar's "More" job now; this only closes it. */}
        {isMobileMenuOpen && (
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-600" title="Close menu">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}>
          {/* pb-tabbar-safe keeps the account controls clear of the tab bar,
              which sits above this overlay. */}
          <div className="absolute top-header-safe left-0 bottom-0 w-64 bg-white shadow-xl pb-tabbar-safe flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex-1 overflow-y-auto">
              <NavLinks />
            </div>
            <AuthSection />
          </div>
        </div>
      )}

      {/* Desktop Collapsible Sidebar */}
      <div 
        className={`hidden md:flex flex-col fixed top-0 left-0 bottom-0 bg-white border-r border-slate-200 transition-all duration-300 z-40 ${
          isSidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="h-20 flex items-center justify-between px-4 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-3 text-orange-600 overflow-hidden">
            <ChefHat className="w-8 h-8 flex-shrink-0" />
            {isSidebarOpen && <span className="font-bold text-xl whitespace-nowrap">The Vault</span>}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <NavLinks />
        </div>

        {/* User Auth Section at Bottom */}
        <AuthSection showLabels={isSidebarOpen} />
        
        {/* Collapse Toggle Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-4 top-24 bg-white border border-slate-200 rounded-full p-1.5 text-slate-400 hover:text-orange-600 shadow-sm"
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 transition-all duration-300 pt-header-safe md:pt-0 pb-tabbar-safe md:pb-0 ${
        isSidebarOpen ? 'md:ml-64' : 'md:ml-20'
      }`}>
        <main className="min-h-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe">
        <div className="h-16 flex items-stretch">
          {tabs.map((tab) => {
            const isActive = isRouteActive(location.pathname, tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.name}
                to={tab.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? 'text-orange-600' : 'text-slate-400'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px] font-semibold">{tab.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isMobileMenuOpen ? 'text-orange-600' : 'text-slate-400'
            }`}
          >
            <Menu className="w-6 h-6" />
            <span className="text-[11px] font-semibold">More</span>
          </button>
        </div>
      </nav>

    </div>
  );
}