import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  X,
  LogOut,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  signInWithGoogle,
  signOutGoogle,
  initGoogleAuth,
  listUserGoogleSheets,
  syncToConnectedSheet,
  saveConnectedSheetMeta,
  getConnectedSheetMeta,
  createGoogleSheetExport,
  findBoonHuatDatabaseId,
  SHARED_SPREADSHEET_NAME,
  ConnectedSheetMetadata,
} from '../utils/googleSheets';
import { Invoice } from '../types';
import { User } from 'firebase/auth';
import { formatDateTimeDisplay } from '../utils/calculations';

interface GoogleSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectSuccess: (meta: ConnectedSheetMetadata) => void;
  lastSyncedAt: string;
  invoices: Invoice[];
}

export const GoogleSheetModal: React.FC<GoogleSheetModalProps> = ({
  isOpen,
  onClose,
  onConnectSuccess,
  invoices,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = initGoogleAuth(
      (authUser, authToken) => {
        setUser(authUser);
        // If user is authenticated on modal open and not yet connected, auto connect
        const existingMeta = getConnectedSheetMeta();
        if (!existingMeta) {
          autoConnectSheet(authToken);
        }
      },
      () => {
        setUser(null);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  const autoConnectSheet = async (authToken: string) => {
    setIsLoading(true);
    setStatusMsg('Connecting to Google Workspace Sheet...');
    setError(null);
    try {
      let targetId: string | null = null;
      const existingMeta = getConnectedSheetMeta();

      // If existing metadata sheet exists, try syncing to it first
      if (existingMeta?.spreadsheetId) {
        try {
          const res = await syncToConnectedSheet(authToken, existingMeta.spreadsheetId, invoices);
          targetId = existingMeta.spreadsheetId;
          const nowIso = formatDateTimeDisplay(new Date().toISOString());

          const meta: ConnectedSheetMetadata = {
            spreadsheetId: targetId,
            spreadsheetName: res.spreadsheetName,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${targetId}/edit`,
            worksheets: res.worksheets,
            lastSyncedAt: nowIso,
          };

          saveConnectedSheetMeta(meta);
          onConnectSuccess(meta);
          setStatusMsg('Successfully connected Google Workspace!');
          setTimeout(() => {
            onClose();
          }, 500);
          return;
        } catch (existingErr: any) {
          console.warn('Could not sync to existing saved sheet, searching Drive:', existingErr);
          saveConnectedSheetMeta(null);
        }
      }

      // Try finding existing "Boon Huat AP Database" spreadsheet in Drive
      try {
        const bhFile = await findBoonHuatDatabaseId(authToken);
        if (bhFile) {
          targetId = bhFile.id;
        } else {
          const files = await listUserGoogleSheets(authToken);
          if (files.length > 0) {
            targetId = files[0].id;
          }
        }
      } catch (e) {
        console.warn('Could not list drive files:', e);
      }

      // If still no sheet found, export/create the Boon Huat AP Database spreadsheet
      if (!targetId) {
        const newSheet = await createGoogleSheetExport(
          authToken,
          invoices,
          SHARED_SPREADSHEET_NAME
        );
        targetId = newSheet.spreadsheetId;
      }

      // Sync data to target sheet
      const res = await syncToConnectedSheet(authToken, targetId, invoices);
      const nowIso = formatDateTimeDisplay(new Date().toISOString());

      const meta: ConnectedSheetMetadata = {
        spreadsheetId: targetId,
        spreadsheetName: res.spreadsheetName,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${targetId}/edit`,
        worksheets: res.worksheets,
        lastSyncedAt: nowIso,
      };

      saveConnectedSheetMeta(meta);

      onConnectSuccess(meta);
      setStatusMsg('Successfully connected Google Workspace!');

      // Close modal automatically after brief confirmation
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      const isPermError =
        err?.message?.includes('401') ||
        err?.message?.includes('403') ||
        err?.message?.includes('PERMISSION_DENIED') ||
        err?.message?.includes('UNAUTHENTICATED') ||
        err?.message?.toLowerCase().includes('unauthorized') ||
        err?.message?.toLowerCase().includes('permission');

      if (isPermError) {
        localStorage.removeItem('s3_access_token');
        console.warn('Google auto-connect permission required:', err?.message || err);
        setError('Google authorization or permission required. Please click "Sign in with Google" to authorize access.');
      } else {
        console.warn('Auto connect notice:', err);
        setError(err.message || 'Failed to connect Google Sheet');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setStatusMsg(null);
    try {
      const result = await signInWithGoogle();
      if (result) {
        setUser(result.user);
        await autoConnectSheet(result.accessToken);
      }
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = err?.message || '';

      if (errCode === 'auth/popup-closed-by-user' || errMsg.includes('popup-closed-by-user')) {
        setStatusMsg('Sign-in cancelled. Click "Sign in with Google" when ready.');
      } else if (errCode === 'auth/popup-blocked' || errMsg.includes('popup-blocked')) {
        setError('The sign-in popup was blocked by your browser. Please allow popups and try again.');
      } else if (errCode === 'auth/cancelled-popup-request' || errMsg.includes('cancelled-popup-request')) {
        setStatusMsg('Previous sign-in request was cancelled.');
      } else {
        console.error('Login failed:', err);
        const cleanMsg = errMsg.replace(/^Firebase:\n?\s*Error\s*\(|\)\.?$/g, '').trim();
        setError(cleanMsg || 'Google Sign-In failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    saveConnectedSheetMeta(null);
    setUser(null);
    setStatusMsg('Signed out successfully.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Google Workspace
              </div>
              <h3 className="text-sm font-bold text-white">Sign in with Google</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md text-sm font-bold cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center space-x-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="text-center py-2 space-y-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 mx-auto flex items-center justify-center border border-slate-200 text-slate-700 font-bold text-lg">
              {user ? user.email?.charAt(0).toUpperCase() : 'G'}
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {user ? user.displayName || user.email : 'Google Authentication'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                {user
                  ? `Connected as ${user.email}`
                  : 'Sign in with Google to automatically connect your payment sheet.'}
              </p>
            </div>

            {isLoading ? (
              <div className="py-4 flex items-center justify-center space-x-2 text-slate-600 font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span>Authenticating &amp; Connecting...</span>
              </div>
            ) : !user ? (
              <div className="pt-2">
                <button
                  onClick={handleSignIn}
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center space-x-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer hover:border-slate-400"
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
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex items-center justify-center space-x-3">
                <div className="inline-flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Connected</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
