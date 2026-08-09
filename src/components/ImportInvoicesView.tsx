import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Database,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Invoice } from '../types';
import {
  ConnectedSheetMetadata,
  getCachedAccessToken,
  getCurrentUser,
  initGoogleAuth,
  signInWithGoogle,
} from '../utils/googleSheets';
import { User } from 'firebase/auth';
import { ManualConnectSheetModal } from './ManualConnectSheetModal';

interface ImportInvoicesViewProps {
  invoices: Invoice[];
  totalMatchingRows: number;
  recordsExcluded: number;
  connectedSheetMeta: ConnectedSheetMetadata | null;
  onOpenGoogleSheetModal: () => void;
  onNavigateToReview?: () => void;
  onResyncMatchingResults?: () => void;
  isLoadingSheet?: boolean;
  sheetReadError?: string | null;
  onConnectSheetSuccess?: (meta: ConnectedSheetMetadata) => void;
}

export const ImportInvoicesView: React.FC<ImportInvoicesViewProps> = ({
  invoices,
  totalMatchingRows,
  recordsExcluded,
  connectedSheetMeta,
  onNavigateToReview,
  onResyncMatchingResults,
  isLoadingSheet = false,
  sheetReadError = null,
  onConnectSheetSuccess,
}) => {
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  const [isSigningInState, setIsSigningInState] = useState<boolean>(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (authUser) => {
        setUser(authUser);
      },
      () => {
        setUser(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const token = getCachedAccessToken();
  const isSignedIn = Boolean(user || token);
  const isWorkspaceConnected = Boolean(connectedSheetMeta && connectedSheetMeta.spreadsheetId && token);

  const spreadsheetNameDisplay = isWorkspaceConnected
    ? connectedSheetMeta?.spreadsheetName || 'Boon Huat AP Database'
    : 'Not Connected';

  const googleAccountDisplay = isSignedIn
    ? user?.email || 'boonhuathardware@gmail.com'
    : 'Not Signed In';

  const eligibleCount = invoices.length;
  const isProceedEnabled = isWorkspaceConnected && !sheetReadError && eligibleCount > 0;

  const handleSignInWithGoogle = async () => {
    setIsSigningInState(true);
    try {
      const res = await signInWithGoogle();
      if (res?.user) {
        setUser(res.user);
        if (onResyncMatchingResults) {
          onResyncMatchingResults();
        }
      }
    } catch (err) {
      console.warn('Google sign-in notice:', err);
    } finally {
      setIsSigningInState(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Matched Invoice Review
              </h2>
              <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
                Payment Queue
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Review the invoices retrieved from Matching Results before proceeding to payment processing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isWorkspaceConnected && (
              <button
                type="button"
                onClick={onResyncMatchingResults}
                disabled={isLoadingSheet}
                className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                <span>Re-Sync Matching Results</span>
              </button>
            )}
          </div>
        </div>

        {/* Connected Google Sheet Section (Manual Fallback Connection) */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-100/80 text-emerald-700 rounded-lg border border-emerald-200/80">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Connected Google Sheet</h3>
            </div>

            <div className="text-xs space-y-1.5 text-slate-700 pl-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">• Spreadsheet Name:</span>
                <span className="font-bold text-slate-900">{spreadsheetNameDisplay}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">• Connected Google Account:</span>
                <span className="font-bold text-slate-900">{googleAccountDisplay}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">• Connection Status:</span>
                {isWorkspaceConnected ? (
                  <span className="inline-flex items-center space-x-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 font-bold text-slate-600 bg-slate-200/80 px-2.5 py-0.5 rounded-md border border-slate-300 text-[11px]">
                    <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Disconnected</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/60">
            {!isSignedIn ? (
              <button
                type="button"
                onClick={handleSignInWithGoogle}
                disabled={isSigningInState}
                className="flex items-center space-x-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xs transition-all cursor-pointer hover:border-slate-400"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            ) : !isWorkspaceConnected ? (
              <button
                type="button"
                onClick={() => setIsConnectModalOpen(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xs transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Connect Google Sheet</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsConnectModalOpen(true)}
                className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xs transition-all cursor-pointer hover:border-slate-400"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Change Connected Sheet</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Summary Cards Section */}
        <div>
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Matching Results Summary</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Card 1 */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Records Read
              </span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {totalMatchingRows}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Rows in Matching Results
              </span>
            </div>

            {/* Card 2 */}
            <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                Eligible for Payment
              </span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                {eligibleCount}
              </span>
              <span className="text-[11px] text-emerald-800 font-medium mt-0.5 block">
                Matched &amp; Approved
              </span>
            </div>

            {/* Card 3 */}
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                Records Excluded
              </span>
              <span className="text-2xl font-black text-amber-800 mt-1 block">
                {recordsExcluded}
              </span>
              <span className="text-[11px] text-amber-900 font-medium mt-0.5 block">
                Unmatched or Disputed
              </span>
            </div>
          </div>
        </div>

        {/* Error Indicator (if retrieval fails) */}
        {sheetReadError && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3.5 flex items-center space-x-3 text-red-950 text-xs font-bold">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{sheetReadError}</span>
          </div>
        )}

        {/* 3. Action Bar / Proceed Button */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 flex items-center space-x-2">
            <Database className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              {isWorkspaceConnected
                ? `Connected to "${connectedSheetMeta?.spreadsheetName || 'Boon Huat AP Database'}"`
                : 'Connect Google Workspace to proceed with payment queue authorization'}
            </span>
          </div>

          <button
            type="button"
            onClick={onNavigateToReview}
            disabled={!isProceedEnabled}
            className={`flex items-center space-x-2 font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer ${
              isProceedEnabled
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-pointer'
                : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-75'
            }`}
          >
            <span>Proceed to Review &amp; Process</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Manual Connect Sheet Modal */}
      <ManualConnectSheetModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onSuccess={(meta) => {
          if (onConnectSheetSuccess) {
            onConnectSheetSuccess(meta);
          }
        }}
      />
    </div>
  );
};

