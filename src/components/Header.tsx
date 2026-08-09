import React from 'react';
import { Building2, UserCheck, RefreshCw, FileSpreadsheet, History, PlusCircle, ShieldCheck, Calendar } from 'lucide-react';

interface HeaderProps {
  referenceDate: string;
  onReferenceDateChange: (date: string) => void;
  onOpenAuditLog: () => void;
  onOpenGoogleSheetModal: () => void;
  onOpenAddInvoice: () => void;
  onResetData: () => void;
  activeTab: 'schedule' | 'approval' | 'history';
  setActiveTab: (tab: 'schedule' | 'approval' | 'history') => void;
  pendingApprovalCount: number;
  approvedCount: number;
  processingCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  referenceDate,
  onReferenceDateChange,
  onOpenAuditLog,
  onOpenGoogleSheetModal,
  onOpenAddInvoice,
  onResetData,
  activeTab,
  setActiveTab,
  pendingApprovalCount,
  approvedCount,
  processingCount,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30">
      {/* Top Banner / Company Branding */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Company Title & App Name */}
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 bg-blue-900 text-white rounded-lg flex items-center justify-center font-bold text-xl shadow-xs border border-blue-950">
              BH
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                  Accounts Payable • Solution 3
                </span>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Boon Huat Hardware &amp; Supplies Pte Ltd
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Payment Management Assistant
              </h1>
            </div>
          </div>

          {/* User Profile & Reference Date Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Active User Madam Lim */}
            <div className="flex items-center space-x-2 bg-slate-100 border border-slate-200 rounded-md px-3 py-1.5 text-xs text-slate-700">
              <UserCheck className="w-4 h-4 text-blue-700" />
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold leading-none">Approver</span>
                <span className="font-bold text-slate-800 text-xs">Madam Lim</span>
              </div>
            </div>

            {/* Simulated Reference Date Selector */}
            <div className="flex items-center space-x-2 bg-blue-50/80 border border-blue-200 rounded-md px-2.5 py-1 text-xs text-blue-900">
              <Calendar className="w-4 h-4 text-blue-700" />
              <div>
                <label htmlFor="ref-date-input" className="text-[10px] text-blue-700 block font-semibold leading-none">Evaluation Date</label>
                <input
                  id="ref-date-input"
                  type="date"
                  value={referenceDate}
                  onChange={(e) => onReferenceDateChange(e.target.value)}
                  className="bg-transparent font-medium text-xs text-blue-950 focus:outline-hidden cursor-pointer"
                  title="Change evaluation reference date to test urgency tier calculations"
                />
              </div>
            </div>

            {/* Google Sheets Connection Status */}
            <button
              onClick={onOpenGoogleSheetModal}
              className="flex items-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              title="View Google Sheets Database Integration Schema"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Sample Data Mode</span>
              <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-1.5 py-0.5 rounded-xs">Sheet Ready</span>
            </button>

            {/* Audit Log Button */}
            <button
              onClick={onOpenAuditLog}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <History className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Audit Trail</span>
            </button>
          </div>
        </div>

        {/* Secondary Navigation Row: Tabs & Action Modals */}
        <div className="mt-4 pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Main Navigation Tabs */}
          <nav className="flex space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md transition-all ${
                activeTab === 'schedule'
                  ? 'bg-white text-blue-900 font-bold shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>1. Payment Schedule</span>
            </button>

            <button
              onClick={() => setActiveTab('approval')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md transition-all ${
                activeTab === 'approval'
                  ? 'bg-white text-blue-900 font-bold shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>2. Approval &amp; Processing</span>
              {pendingApprovalCount > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-300">
                  {pendingApprovalCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-md transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-blue-900 font-bold shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>3. Payment History</span>
            </button>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={onOpenAddInvoice}
              className="flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-md px-3 py-1.5 text-xs font-medium shadow-xs transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Test Invoice</span>
            </button>

            <button
              onClick={onResetData}
              className="text-slate-500 hover:text-slate-800 p-1.5 rounded-md hover:bg-slate-100 transition-colors text-xs flex items-center space-x-1"
              title="Reset Sample Data to default state"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset Data</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
