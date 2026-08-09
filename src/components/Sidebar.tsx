import React from 'react';
import {
  Clock,
  ShieldCheck,
  Database,
  Menu,
  X,
  FileSpreadsheet,
} from 'lucide-react';

export type NavTab = 'schedule' | 'googlesheets' | 'connections';

export interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  pendingApprovalCount: number;
  onOpenAuditLog?: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  dataMode?: 'Live Database' | 'No Database Connected';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalCount,
  onOpenAuditLog,
  isMobileOpen,
  setIsMobileOpen,
  dataMode = 'Live Database',
}) => {
  const handleNavClick = (tab: NavTab) => {
    setActiveTab(tab);
    setIsMobileOpen(false);
  };

  const handleAuditClick = () => {
    onOpenAuditLog();
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0b1329] text-slate-300 flex flex-col justify-between border-r border-slate-800/80 transition-transform duration-300 md:static md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Section */}
        <div className="p-4 flex-1 flex flex-col overflow-y-auto">
          {/* Header Branding */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div className="flex items-center space-x-3">
              {/* Blue Square Logo S3 */}
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-blue-500/20 shrink-0">
                S3
              </div>
              <div className="min-w-0">
                <h1 className="text-white font-black text-sm tracking-wide uppercase leading-tight">
                  SOLUTION 3
                </h1>
                <p className="text-slate-400 text-xs font-normal truncate mt-0.5">
                  Boon Huat Hardware &amp; Supplies
                </p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status Indicator */}
          <div className="mt-3 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px] font-medium">Running Mann AP</span>
            <div className="flex items-center space-x-1.5 font-semibold text-emerald-400 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{dataMode}</span>
            </div>
          </div>

          {/* Nav Group 1: PAYMENT MANAGEMENT */}
          <div className="mt-6">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
              PAYMENT MANAGEMENT
            </div>
            <nav className="space-y-1">
              {/* Payment Management */}
              <button
                onClick={() => handleNavClick('schedule')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium text-xs flex items-center justify-between transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Payment Management</span>
                </div>
                {pendingApprovalCount > 0 && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      activeTab === 'schedule'
                        ? 'bg-white text-blue-700'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {pendingApprovalCount}
                  </span>
                )}
              </button>

              {/* Google Sheets */}
              <button
                onClick={() => handleNavClick('googlesheets')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium text-xs flex items-center space-x-3 transition-colors ${
                  activeTab === 'googlesheets'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="flex-1">Google Sheets</span>
              </button>
            </nav>
          </div>

          {/* Nav Group 2: DATABASE & INTEGRATIONS */}
          <div className="mt-6">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
              DATABASE &amp; INTEGRATIONS
            </div>
            <nav className="space-y-1">
              {/* Data Connections */}
              <button
                onClick={() => handleNavClick('connections')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium text-xs flex items-center space-x-3 transition-colors ${
                  activeTab === 'connections'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <Database className="w-4 h-4 shrink-0" />
                <span className="flex-1">Data Connections</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
              ML
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-xs truncate leading-tight">
                Madam Lim
              </div>
              <div className="text-slate-400 text-[11px] truncate font-normal mt-0.5">
                Finance Lead / Final Approver
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
