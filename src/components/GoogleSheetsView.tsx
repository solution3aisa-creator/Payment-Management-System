import React, { useState, useEffect } from 'react';
import { Invoice, UrgencyTier, PaymentStatus } from '../types';
import { formatDateDisplay } from '../utils/calculations';
import {
  getConnectedSheetMeta,
  syncToConnectedSheet,
  readFromConnectedSheet,
  getCachedAccessToken,
  ConnectedSheetMetadata,
} from '../utils/googleSheets';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  ShieldCheck,
  Table,
  X,
  Link2,
  Loader2,
  Database,
} from 'lucide-react';

interface GoogleSheetsViewProps {
  invoices: Invoice[];
  referenceDate: string;
  lastSyncedAt: string;
  onOpenGoogleSheetModal: () => void;
  onSyncComplete?: (syncTime: string) => void;
  connectedMeta: ConnectedSheetMetadata | null;
}

export const GoogleSheetsView: React.FC<GoogleSheetsViewProps> = ({
  invoices,
  referenceDate,
  lastSyncedAt,
  onOpenGoogleSheetModal,
  onSyncComplete,
  connectedMeta,
}) => {
  const [activeWorksheet, setActiveWorksheet] = useState<'schedule' | 'urgency' | 'payment'>('schedule');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [sheetData, setSheetData] = useState<{
    scheduleRows: string[][];
    urgencyRows: string[][];
    paymentRows: string[][];
  } | null>(null);

  const loadSheetPreview = async () => {
    if (!connectedMeta) {
      setSheetData(null);
      return;
    }
    const token = getCachedAccessToken();
    if (!token) return;

    setIsLoadingPreview(true);
    try {
      const readRes = await readFromConnectedSheet(token, connectedMeta.spreadsheetId);
      setSheetData({
        scheduleRows: readRes.scheduleRows,
        urgencyRows: readRes.urgencyRows,
        paymentRows: readRes.paymentRows,
      });
    } catch (err: any) {
      console.warn('Preview load notice:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    loadSheetPreview();
  }, [connectedMeta, lastSyncedAt]);

  const handleOpenConnectedSheet = () => {
    setStatusNotification(null);
    if (connectedMeta?.spreadsheetUrl) {
      window.open(connectedMeta.spreadsheetUrl, '_blank');
    } else {
      setStatusNotification('No Google Sheet is currently connected. Please connect a Google Sheet first.');
    }
  };

  const handleSyncNow = async () => {
    if (!connectedMeta) {
      setStatusNotification('No Google Sheet is currently connected. Please connect a Google Sheet first.');
      return;
    }

    const token = getCachedAccessToken();
    if (!token) {
      setStatusNotification('Google authorization required. Please click "Connect Google Sheet" to authorize.');
      onOpenGoogleSheetModal();
      return;
    }

    setIsSyncing(true);
    setStatusNotification(null);

    try {
      // 1. Export current state to connected Google Sheet
      await syncToConnectedSheet(token, connectedMeta.spreadsheetId, invoices);

      // 2. Read back actual worksheet ranges
      const readRes = await readFromConnectedSheet(token, connectedMeta.spreadsheetId);

      // 3. Update preview only with read-back values
      setSheetData({
        scheduleRows: readRes.scheduleRows,
        urgencyRows: readRes.urgencyRows,
        paymentRows: readRes.paymentRows,
      });

      const nowDisplay = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      if (onSyncComplete) {
        onSyncComplete(nowDisplay);
      }

      setStatusNotification(`Successfully synchronized and verified with "${connectedMeta.spreadsheetName}"!`);
    } catch (err: any) {
      console.error('Sync error:', err);
      setStatusNotification(
        `Google Sheets export failed. The connected spreadsheet was not updated. ${err.message || ''}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter raw rows from actual Google Sheet for preview
  const currentWorksheetRows =
    activeWorksheet === 'schedule'
      ? sheetData?.scheduleRows?.slice(1) || []
      : activeWorksheet === 'urgency'
      ? sheetData?.urgencyRows?.slice(1) || []
      : sheetData?.paymentRows?.slice(1) || [];

  const filteredSheetRows = currentWorksheetRows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return row.some((cell) => String(cell || '').toLowerCase().includes(q));
  });

  const getRecommendationBadge = (rec: string) => {
    if (rec.includes('Immediately')) {
      return (
        <span className="inline-flex items-center space-x-1 bg-red-100 text-red-800 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-red-300">
          <AlertTriangle className="w-3 h-3 text-red-600" />
          <span>{rec}</span>
        </span>
      );
    }
    if (rec.includes('This Week')) {
      return (
        <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-amber-300">
          <Clock className="w-3 h-3 text-amber-700" />
          <span>{rec}</span>
        </span>
      );
    }
    if (rec.includes('Next Week')) {
      return (
        <span className="inline-flex items-center space-x-1 bg-blue-100 text-blue-900 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-blue-300">
          <Calendar className="w-3 h-3 text-blue-700" />
          <span>{rec}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-900 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-emerald-300">
        <CheckCircle2 className="w-3 h-3 text-emerald-700" />
        <span>{rec}</span>
      </span>
    );
  };

  // Badge helpers
  const getUrgencyBadge = (tier: UrgencyTier) => {
    switch (tier) {
      case 'Overdue':
        return (
          <span className="inline-flex items-center space-x-1 bg-red-100 text-red-800 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-red-300">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            <span>Overdue</span>
          </span>
        );
      case 'Urgent':
        return (
          <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-amber-300">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>Urgent</span>
          </span>
        );
      case 'Upcoming':
        return (
          <span className="inline-flex items-center space-x-1 bg-blue-100 text-blue-900 text-[11px] font-bold px-2 py-0.5 rounded-xs border border-blue-300">
            <Calendar className="w-3 h-3 text-blue-700" />
            <span>Upcoming</span>
          </span>
        );
      case 'Not Due Yet':
        return (
          <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-900 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            <span>Not Due Yet</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 bg-slate-100 text-slate-800 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-slate-300">
            <span>{tier}</span>
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'Pending Approval':
        return (
          <span className="bg-amber-50 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-amber-200">
            Pending Approval
          </span>
        );
      case 'Approved':
        return (
          <span className="bg-indigo-50 text-indigo-800 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-indigo-200">
            Approved
          </span>
        );
      case 'Processing':
        return (
          <span className="bg-sky-50 text-sky-800 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-sky-200">
            Processing
          </span>
        );
      case 'Paid':
        return (
          <span className="bg-emerald-50 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-emerald-200">
            Paid
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Google Sheets Database</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Live preview and synchronization with your Google Sheet database for payment management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connected Spreadsheet Name & Last Synced Info */}
          <div className="text-right text-xs">
            <div className="font-bold text-slate-900 flex items-center justify-end space-x-1.5">
              <span className="text-slate-500 font-normal">Spreadsheet:</span>
              <span className="text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {connectedMeta ? connectedMeta.spreadsheetName : 'Not Connected'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Last Synced: <strong className="text-slate-700">{connectedMeta?.lastSyncedAt || lastSyncedAt}</strong>
            </div>
          </div>

          {/* Sync Now Button */}
          <button
            onClick={handleSyncNow}
            disabled={!connectedMeta || isSyncing}
            className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <RefreshCw className="w-4 h-4 text-white" />
            )}
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {statusNotification && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-medium shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{statusNotification}</span>
          </div>
          <button
            onClick={() => setStatusNotification(null)}
            className="text-amber-700 hover:text-amber-950 p-1 font-bold cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Spreadsheet Container Component */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden flex flex-col">
        {/* Google Sheets Header bar UI */}
        <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between border-b border-emerald-900">
          <div className="flex items-center space-x-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-200 shrink-0" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">
                  {connectedMeta ? connectedMeta.spreadsheetName : 'No Google Sheet Connected'}
                </span>
                {connectedMeta ? (
                  <span className="text-[10px] bg-emerald-900/90 text-emerald-200 px-2 py-0.5 rounded-xs font-mono border border-emerald-700">
                    Google Drive Synced
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-900/80 text-amber-200 px-2 py-0.5 rounded-xs font-mono">
                    Status: Unconnected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-200/90 mt-0.5">
                {connectedMeta
                  ? `Last updated: ${connectedMeta.lastSyncedAt || lastSyncedAt} • Worksheets: Payment Schedule, Urgency Status, Payment Status`
                  : 'Connect a Google Sheet to enable live synchronization.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-emerald-100 font-medium hidden sm:inline">
              Worksheet View Mode
            </span>
          </div>
        </div>

        {/* Toolbar & Search Bar */}
        <div className="bg-slate-100 p-3 border-b border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Worksheet Tabs */}
          <div className="flex items-center space-x-1 bg-slate-200 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveWorksheet('schedule')}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeWorksheet === 'schedule'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Worksheet 1: Payment Schedule</span>
            </button>

            <button
              onClick={() => setActiveWorksheet('urgency')}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeWorksheet === 'urgency'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Worksheet 2: Urgency Status</span>
            </button>

            <button
              onClick={() => setActiveWorksheet('payment')}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeWorksheet === 'payment'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Worksheet 3: Payment Status</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search sheet data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 outline-hidden focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        {/* Worksheet Description Banner */}
        <div className="bg-emerald-50/60 border-b border-emerald-200/80 px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between">
          {activeWorksheet === 'schedule' ? (
            <div className="flex items-center space-x-2">
              <span className="font-bold text-emerald-950">Worksheet 1 (Payment Schedule):</span>
              <span className="text-emerald-800">
                Supplier Name, Invoice Number, PO Number, Due Date, Days Remaining, Payment Terms, Recommendation
              </span>
            </div>
          ) : activeWorksheet === 'urgency' ? (
            <div className="flex items-center space-x-2">
              <span className="font-bold text-emerald-950">Worksheet 2 (Urgency Status):</span>
              <span className="text-emerald-800">
                Supplier Name, Invoice Number, Invoice Date, PO Number, Item Description, Invoice Total, Due Date, Days Remaining, Urgency Status
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="font-bold text-emerald-950">Worksheet 3 (Payment Status):</span>
              <span className="text-emerald-800">
                Supplier Name, Invoice Number, PO Number, Payment Status, Approver Name, Approval Date, Processing Date, Payment Date, Comments
              </span>
            </div>
          )}

          <span className="font-mono text-[11px] text-emerald-700 font-semibold shrink-0 ml-2">
            {connectedMeta ? `${filteredSheetRows.length} Rows` : 'Unconnected'}
          </span>
        </div>

        {/* Spreadsheet Table Preview */}
        {isLoadingPreview ? (
          <div className="p-12 text-center bg-white">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Fetching live data from connected Google Sheet...</h4>
          </div>
        ) : filteredSheetRows.length === 0 ? (
          <div className="p-12 text-center bg-white">
            <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No invoice records retrieved from Google Sheet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {connectedMeta
                ? 'Click "Sync Now" to export active application records to Google Drive and verify the sheet values.'
                : 'Use the top Google Workspace connection bar to connect a Google Sheet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-left text-xs border-collapse">
              {/* Sheet Column Headers (A, B, C, D...) */}
              <thead>
                <tr className="bg-slate-200/70 text-slate-500 font-mono text-[10px] text-center border-b border-slate-300 select-none">
                  <th className="w-10 bg-slate-300/60 border-r border-slate-300 py-1 font-semibold">#</th>
                  <th className="border-r border-slate-300 py-1 px-3">A</th>
                  <th className="border-r border-slate-300 py-1 px-3">B</th>
                  <th className="border-r border-slate-300 py-1 px-3">C</th>
                  <th className="border-r border-slate-300 py-1 px-3">D</th>
                  <th className="border-r border-slate-300 py-1 px-3">E</th>
                  <th className="border-r border-slate-300 py-1 px-3">F</th>
                  <th className="border-r border-slate-300 py-1 px-3">G</th>
                  {activeWorksheet !== 'schedule' && (
                    <>
                      <th className="border-r border-slate-300 py-1 px-3">H</th>
                      <th className="border-r border-slate-300 py-1 px-3">I</th>
                    </>
                  )}
                </tr>

                {/* Table Header Row */}
                {activeWorksheet === 'schedule' ? (
                  <tr className="bg-[#D9EAD3] text-emerald-950 font-bold text-xs border-b border-emerald-300">
                    <td className="w-10 bg-slate-200 text-slate-600 font-mono text-center border-r border-slate-300 py-2">
                      1
                    </td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Supplier Name</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Invoice Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">PO Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Due Date</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Days Remaining</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Payment Terms</td>
                    <td className="py-2.5 px-4 text-center">Recommendation</td>
                  </tr>
                ) : activeWorksheet === 'urgency' ? (
                  <tr className="bg-[#D9EAD3] text-emerald-950 font-bold text-xs border-b border-emerald-300">
                    <td className="w-10 bg-slate-200 text-slate-600 font-mono text-center border-r border-slate-300 py-2">
                      1
                    </td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Supplier Name</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Invoice Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Invoice Date</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">PO Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Item Description</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Invoice Total</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Due Date</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Days Remaining</td>
                    <td className="py-2.5 px-4 text-center">Urgency Status</td>
                  </tr>
                ) : (
                  <tr className="bg-[#D9EAD3] text-emerald-950 font-bold text-xs border-b border-emerald-300">
                    <td className="w-10 bg-slate-200 text-slate-600 font-mono text-center border-r border-slate-300 py-2">
                      1
                    </td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Supplier Name</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Invoice Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">PO Number</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Payment Status</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Approver Name</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Approval Date</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Processing Date</td>
                    <td className="py-2.5 px-4 border-r border-emerald-300/80 text-center">Payment Date</td>
                    <td className="py-2.5 px-4 text-center">Comments</td>
                  </tr>
                )}
              </thead>

              {/* Data Rows */}
              <tbody className="divide-y divide-slate-200 font-sans text-xs">
                {activeWorksheet === 'schedule'
                  ? filteredSheetRows.map((row, idx) => {
                      const supplierName = row[0] || '—';
                      const invoiceNumber = row[1] || '—';
                      const poNumber = row[2] || '—';
                      const dueDate = row[3] || '—';
                      const daysText = row[4] || '—';
                      const paymentTerms = row[5] || '—';
                      const recommendation = row[6] || '—';

                      return (
                        <tr
                          key={`sched-${invoiceNumber}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70 hover:bg-slate-100/80'}
                        >
                          <td className="w-10 bg-slate-100/80 text-slate-500 font-mono text-[11px] text-center border-r border-slate-300 py-2.5 font-medium select-none">
                            {idx + 2}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 border-r border-slate-200">
                            {supplierName}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-blue-900 border-r border-slate-200">
                            {invoiceNumber}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700 border-r border-slate-200">
                            {poNumber}
                          </td>
                          <td className="py-2.5 px-4 text-slate-800 border-r border-slate-200 whitespace-nowrap">
                            {dueDate}
                          </td>
                          <td
                            className={`py-2.5 px-4 font-medium border-r border-slate-200 whitespace-nowrap ${
                              daysText.includes('overdue')
                                ? 'text-red-700 font-bold'
                                : daysText.includes('Due today') || daysText.includes('1 days') || daysText.includes('2 days') || daysText.includes('3 days')
                                ? 'text-amber-800 font-bold'
                                : 'text-slate-700'
                            }`}
                          >
                            {daysText}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {paymentTerms}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {getRecommendationBadge(recommendation)}
                          </td>
                        </tr>
                      );
                    })
                  : activeWorksheet === 'urgency'
                  ? filteredSheetRows.map((row, idx) => {
                      const supplierName = row[0] || '—';
                      const invoiceNumber = row[1] || '—';
                      const invoiceDate = row[2] || '—';
                      const poNumber = row[3] || '—';
                      const itemDesc = row[4] || '—';
                      const invoiceTotal = row[5] || '—';
                      const dueDate = row[6] || '—';
                      const daysText = row[7] || '—';
                      const urgencyStatus = row[8] || '—';

                      return (
                        <tr
                          key={`urg-${invoiceNumber}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70 hover:bg-slate-100/80'}
                        >
                          <td className="w-10 bg-slate-100/80 text-slate-500 font-mono text-[11px] text-center border-r border-slate-300 py-2.5 font-medium select-none">
                            {idx + 2}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 border-r border-slate-200">
                            {supplierName}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-blue-900 border-r border-slate-200">
                            {invoiceNumber}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {invoiceDate}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700 border-r border-slate-200">
                            {poNumber}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 max-w-xs truncate" title={itemDesc}>
                            {itemDesc}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                            {invoiceTotal}
                          </td>
                          <td className="py-2.5 px-4 text-slate-800 border-r border-slate-200 whitespace-nowrap">
                            {dueDate}
                          </td>
                          <td
                            className={`py-2.5 px-4 font-medium border-r border-slate-200 whitespace-nowrap ${
                              daysText.includes('overdue')
                                ? 'text-red-700 font-bold'
                                : daysText.includes('Due today') || daysText.includes('1 days') || daysText.includes('2 days') || daysText.includes('3 days')
                                ? 'text-amber-800 font-bold'
                                : 'text-slate-700'
                            }`}
                          >
                            {daysText}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                            {urgencyStatus}
                          </td>
                        </tr>
                      );
                    })
                  : filteredSheetRows.map((row, idx) => {
                      const supplierName = row[0] || '—';
                      const invoiceNumber = row[1] || '—';
                      const poNumber = row[2] || '—';
                      const status = (row[3] || 'Pending Approval') as PaymentStatus;
                      const approverName = row[4] || '—';
                      const approvalDate = row[5] || '—';
                      const processingDate = row[6] || '—';
                      const paymentDate = row[7] || '—';
                      const comments = row[8] || '—';

                      return (
                        <tr
                          key={`pay-${invoiceNumber}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70 hover:bg-slate-100/80'}
                        >
                          <td className="w-10 bg-slate-100/80 text-slate-500 font-mono text-[11px] text-center border-r border-slate-300 py-2.5 font-medium select-none">
                            {idx + 2}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 border-r border-slate-200">
                            {supplierName}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-blue-900 border-r border-slate-200">
                            {invoiceNumber}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700 border-r border-slate-200">
                            {poNumber}
                          </td>
                          <td className="py-2.5 px-4 border-r border-slate-200 whitespace-nowrap">
                            {getPaymentStatusBadge(status)}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800 border-r border-slate-200 whitespace-nowrap">
                            {approverName}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {approvalDate}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {processingDate}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {paymentDate}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={comments}>
                            {comments}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info bar */}
        <div className="bg-slate-100 px-4 py-2 border-t border-slate-300 text-[11px] text-slate-500 flex items-center justify-between overflow-x-auto">
          <div className="flex items-center space-x-2 font-mono whitespace-nowrap">
            <span>Worksheet 1: Payment Schedule</span>
            <span>•</span>
            <span>Worksheet 2: Urgency Status</span>
            <span>•</span>
            <span>Worksheet 3: Payment Status</span>
          </div>
          <div className="whitespace-nowrap ml-4">{connectedMeta ? 'Connected to Google Drive • Live Sync' : 'No Connection'}</div>
        </div>
      </div>
    </div>
  );
};

