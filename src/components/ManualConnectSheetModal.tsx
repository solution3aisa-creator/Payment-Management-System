import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Search,
  Link as LinkIcon,
  ShieldAlert,
} from 'lucide-react';
import {
  getCachedAccessToken,
  listUserGoogleSheets,
  saveConnectedSheetMeta,
  GoogleDriveSheet,
  ConnectedSheetMetadata,
  fetchWithRetry,
} from '../utils/googleSheets';
import { formatDateTimeDisplay } from '../utils/calculations';

interface ManualConnectSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (meta: ConnectedSheetMetadata) => void;
}

export function extractSpreadsheetId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export const ManualConnectSheetModal: React.FC<ManualConnectSheetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [driveSheets, setDriveSheets] = useState<GoogleDriveSheet[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [urlOrIdInput, setUrlOrIdInput] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSelectedSheetId('');
    setUrlOrIdInput('');
    setSearchQuery('');

    const token = getCachedAccessToken();
    if (token) {
      loadDriveSheets(token);
    }
  }, [isOpen]);

  const loadDriveSheets = async (token: string) => {
    setIsLoadingDrive(true);
    try {
      const files = await listUserGoogleSheets(token);
      setDriveSheets(files);
      if (files.length > 0) {
        setSelectedSheetId(files[0].id);
      }
    } catch (err: any) {
      console.warn('Could not list Drive spreadsheets:', err);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleVerifyAndConnect = async (targetSpreadsheetId?: string) => {
    setError(null);
    const rawId = targetSpreadsheetId || selectedSheetId || urlOrIdInput;
    const cleanId = extractSpreadsheetId(rawId);

    if (!cleanId) {
      setError('Please select a spreadsheet from Google Drive or enter a valid Google Sheets URL.');
      return;
    }

    const token = getCachedAccessToken();
    if (!token) {
      setError('The signed-in Google account does not have permission to access this spreadsheet.');
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=properties.title,sheets.properties.title`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        setError('The signed-in Google account does not have permission to access this spreadsheet.');
        setIsVerifying(false);
        return;
      }

      const metaData = await response.json();
      const sheetTitles: string[] = (metaData.sheets || []).map((s: any) =>
        String(s.properties?.title || '').trim()
      );

      // Verify that it contains a worksheet named "Matching Results"
      const hasMatchingResults = sheetTitles.some(
        (t) => t.toLowerCase() === 'matching results'
      );

      if (!hasMatchingResults) {
        setError(
          'This spreadsheet cannot be used because the Matching Results worksheet was not found.'
        );
        setIsVerifying(false);
        return;
      }

      // Both verifications passed! Construct metadata and establish connection
      const spreadsheetName = metaData.properties?.title || 'Google Sheet';
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/edit`;
      const nowIso = formatDateTimeDisplay(new Date().toISOString());

      const newMeta: ConnectedSheetMetadata = {
        spreadsheetId: cleanId,
        spreadsheetName,
        spreadsheetUrl,
        worksheets: sheetTitles,
        lastSyncedAt: nowIso,
      };

      saveConnectedSheetMeta(newMeta);
      onSuccess(newMeta);
      setIsVerifying(false);
      onClose();
    } catch (err: any) {
      console.error('Verification error:', err);
      const msg = String(err?.message || '').toLowerCase();
      if (
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('permission') ||
        msg.includes('unauthorized') ||
        msg.includes('unauthenticated')
      ) {
        setError('The signed-in Google account does not have permission to access this spreadsheet.');
      } else {
        setError('The signed-in Google account does not have permission to access this spreadsheet.');
      }
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  const filteredSheets = driveSheets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Fallback Connection
              </div>
              <h3 className="text-sm font-bold text-white">Connect Google Sheet</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md text-sm font-bold cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-xl flex items-start space-x-2.5 shadow-2xs">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold leading-relaxed">{error}</div>
            </div>
          )}

          {/* Option A: Select from Google Drive */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Option 1: Select a Spreadsheet from Google Drive
            </label>

            {isLoadingDrive ? (
              <div className="py-8 text-center text-slate-500 flex flex-col items-center space-y-2 bg-slate-50 rounded-xl border border-slate-200">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-xs font-medium">Loading spreadsheets from Drive...</span>
              </div>
            ) : driveSheets.length > 0 ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search spreadsheets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {filteredSheets.length > 0 ? (
                    filteredSheets.map((sheet) => {
                      const isSelected = selectedSheetId === sheet.id;
                      return (
                        <button
                          key={sheet.id}
                          type="button"
                          onClick={() => {
                            setSelectedSheetId(sheet.id);
                            setUrlOrIdInput('');
                            setError(null);
                          }}
                          className={`w-full text-left p-3 flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50/70 text-emerald-950 font-bold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <FileSpreadsheet
                              className={`w-4 h-4 shrink-0 ${
                                isSelected ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            />
                            <span className="truncate text-xs">{sheet.name}</span>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No matching spreadsheets found
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 text-slate-500 text-xs bg-slate-50 rounded-lg border border-slate-200">
                No Google Spreadsheets found in your Drive root folder. You can paste a URL below.
              </div>
            )}
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              OR
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Option B: Paste Google Sheets URL */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Option 2: Paste Google Sheets URL
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={urlOrIdInput}
                onChange={(e) => {
                  setUrlOrIdInput(e.target.value);
                  if (e.target.value) {
                    setSelectedSheetId('');
                  }
                  setError(null);
                }}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleVerifyAndConnect()}
            disabled={isVerifying || (!selectedSheetId && !urlOrIdInput.trim())}
            className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>Verify &amp; Connect</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
