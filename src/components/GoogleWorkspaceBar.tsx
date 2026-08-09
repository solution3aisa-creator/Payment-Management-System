import React from 'react';
import { ConnectedSheetMetadata } from '../utils/googleSheets';
import { FileSpreadsheet } from 'lucide-react';

interface GoogleWorkspaceBarProps {
  connectedMeta: ConnectedSheetMetadata | null;
  onOpenGoogleSheetModal: () => void;
}

export const GoogleWorkspaceBar: React.FC<GoogleWorkspaceBarProps> = ({
  connectedMeta,
  onOpenGoogleSheetModal,
}) => {
  const isConnected = !!connectedMeta;

  const handleOpenSheet = () => {
    if (connectedMeta?.spreadsheetUrl) {
      window.open(connectedMeta.spreadsheetUrl, '_blank');
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 shadow-2xs">
      {/* Google Workspace Connection Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            {isConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>
            )}
          </span>
          <span className={`font-bold ${isConnected ? 'text-slate-800' : 'text-slate-600'}`}>
            {isConnected ? 'Google Workspace Connected' : 'Google Workspace Disconnected'}
          </span>
        </div>

        {isConnected && connectedMeta && (
          <span className="hidden md:inline-block text-[11px] text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {connectedMeta.spreadsheetName}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2.5">
        {/* Sign in / Signed in with Google button */}
        <button
          onClick={onOpenGoogleSheetModal}
          className="inline-flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          <span>{isConnected ? 'Signed in with Google' : 'Sign in with Google'}</span>
        </button>

        {/* Open Connected Google Sheet button */}
        <button
          onClick={handleOpenSheet}
          disabled={!isConnected}
          className={`inline-flex items-center space-x-1.5 font-bold text-xs px-3 py-1.5 rounded-lg transition-all ${
            isConnected
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs cursor-pointer'
              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span>Open Connected Google Sheet</span>
        </button>
      </div>
    </div>
  );
};
