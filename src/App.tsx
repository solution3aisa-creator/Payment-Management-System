import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, AuditRecord, PaymentStatus } from './types';
import { DEFAULT_REFERENCE_DATE } from './data/sampleData';
import {
  evaluateInvoices,
  sortInvoicesForSchedule,
  computeScheduleSummary,
  formatDateTimeDisplay,
  validateInvoicePaymentStatus,
} from './utils/calculations';
import { parseMatchedInvoicesFile } from './utils/fileParser';
import { ImportInvoicesView } from './components/ImportInvoicesView';
import { ReviewAndProcessView } from './components/ReviewAndProcessView';
import { DashboardView } from './components/DashboardView';
import { AuditTrailModal } from './components/AuditTrailModal';
import { GoogleSheetModal } from './components/GoogleSheetModal';
import { GoogleWorkspaceBar } from './components/GoogleWorkspaceBar';
import {
  AlertTriangle,
  UploadCloud,
  CheckCircle2,
  LayoutDashboard,
  FileSpreadsheet,
  History,
  Shield,
  ArrowRight,
  Building2,
} from 'lucide-react';
import {
  getConnectedSheetMeta,
  saveConnectedSheetMeta,
  syncToConnectedSheet,
  readFromConnectedSheet,
  loadInvoicesFromConnectedSheet,
  appendAuditLogsToSheet,
  SharedAuditEntry,
  findBoonHuatDatabaseId,
  initGoogleAuth,
  getCachedAccessToken,
  ConnectedSheetMetadata,
} from './utils/googleSheets';

export type WorkflowTab = 'import' | 'review' | 'dashboard';

export default function App() {
  // Helper for current local ISO date (YYYY-MM-DD)
  const getTodayDateIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Evaluation Reference Date (Defaults to current system date)
  const [referenceDate, setReferenceDate] = useState<string>(() => getTodayDateIso());

  // Core State - Cached in localStorage, loaded from Google Sheet
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const cached = localStorage.getItem('s3_invoices_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.map((inv: any) => validateInvoicePaymentStatus(inv as Invoice));
          return sortInvoicesForSchedule(evaluateInvoices(validated, new Date()));
        }
      }
    } catch (e) {}
    return [];
  });
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [lastImportResult, setLastImportResult] = useState<{
    addedCount: number;
    ignoredCount: number;
  } | null>(null);

  // Connected Google Sheet Metadata
  const [connectedSheetMeta, setConnectedSheetMeta] = useState<ConnectedSheetMetadata | null>(() =>
    getConnectedSheetMeta()
  );

  // Sync error notification
  const [syncError, setSyncError] = useState<string | null>(null);

  // Active Workflow Tab: 'import' | 'review' | 'dashboard'
  const [activeTab, setActiveTab] = useState<WorkflowTab>('import');

  // Highlighted Invoice for Approval
  const [selectedInvoiceForApprovalId, setSelectedInvoiceForApprovalId] = useState<string | null>(
    null
  );

  // Modal States
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);
  const [auditFilterInvoiceNumber, setAuditFilterInvoiceNumber] = useState<string | null>(null);
  const [googleSheetModalOpen, setGoogleSheetModalOpen] = useState<boolean>(false);

  // Timestamps
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() =>
    formatDateTimeDisplay(new Date().toISOString())
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() =>
    connectedSheetMeta?.lastSyncedAt || formatDateTimeDisplay(new Date().toISOString())
  );

  // State for Matching Results stats
  const [matchingStats, setMatchingStats] = useState<{
    totalMatchingRows: number;
    recordsExcluded: number;
  }>(() => {
    try {
      const cached = localStorage.getItem('s3_matching_stats');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return { totalMatchingRows: 0, recordsExcluded: 0 };
  });

  const updateInvoicesAndCache = (newInvoices: Invoice[]) => {
    setInvoices(newInvoices);
    try {
      localStorage.setItem('s3_invoices_cache', JSON.stringify(newInvoices));
    } catch (e) {}
  };

  // Helper to load and restore existing payment records directly from the active connected Google Sheet
  const loadFromConnectedSheet = async (meta?: ConnectedSheetMetadata | null) => {
    const activeMeta = meta !== undefined ? meta : connectedSheetMeta;
    if (!activeMeta?.spreadsheetId) return;

    const token = getCachedAccessToken();
    if (!token) return;

    try {
      const {
        invoices: loadedInvoices,
        spreadsheetName,
        totalMatchingRows,
        recordsExcluded,
        existingLoggedReviewInvoices,
        existingLoggedOverdueInvoices,
      } = await loadInvoicesFromConnectedSheet(token, activeMeta.spreadsheetId);

      const now = new Date();
      const evaluated = evaluateInvoices(loadedInvoices, now);
      const sorted = sortInvoicesForSchedule(evaluated);

      // Perform a fresh read and replace local dataset with actual returned worksheet data
      updateInvoicesAndCache(sorted);
      setMatchingStats({ totalMatchingRows, recordsExcluded });
      try {
        localStorage.setItem('s3_matching_stats', JSON.stringify({ totalMatchingRows, recordsExcluded }));
      } catch (e) {}

      if (loadedInvoices.length > 0) {
        // Write back eligible invoice records into Payment Schedule, Urgency Status, and Payment Status
        await syncToConnectedSheet(token, activeMeta.spreadsheetId, sorted);

        // Check for new eligible invoices or overdue escalations to log in Audit Log
        const nowIso = new Date().toISOString();
        const formattedTimestamp = formatDateTimeDisplay(nowIso);
        const newAuditEntries: SharedAuditEntry[] = [];

        // 1. Payment Review Started for newly detected invoices
        for (const inv of loadedInvoices) {
          const key = inv.invoiceNumber.trim().toLowerCase();
          if (!existingLoggedReviewInvoices.has(key)) {
            newAuditEntries.push({
              timestamp: formattedTimestamp,
              invoiceNumber: inv.invoiceNumber,
              poNumber: inv.poNumber || 'N/A',
              performedBy: 'Madam Lim',
              role: 'Accounts Executive',
              module: 'Payment Management',
              action: 'Payment Review Started',
              previousStatus: 'Matched',
              newStatus: 'Pending Approval',
              details: 'Invoice loaded into Payment Management for payment review.',
            });
            existingLoggedReviewInvoices.add(key);
          }
        }

        // 2. Invoice became Overdue for overdue unpaid invoices
        for (const inv of sorted) {
          if (inv.urgencyTier === 'Overdue' && inv.paymentStatus !== 'Paid') {
            const key = inv.invoiceNumber.trim().toLowerCase();
            if (!existingLoggedOverdueInvoices.has(key)) {
              newAuditEntries.push({
                timestamp: formattedTimestamp,
                invoiceNumber: inv.invoiceNumber,
                poNumber: inv.poNumber || 'N/A',
                performedBy: 'Madam Lim',
                role: 'Accounts Executive',
                module: 'Solution 3',
                action: 'Invoice became Overdue',
                previousStatus: 'Urgent',
                newStatus: 'Overdue',
                details: 'Invoice exceeded due date and has been escalated for immediate review.',
              });
              existingLoggedOverdueInvoices.add(key);
            }
          }
        }

        if (newAuditEntries.length > 0) {
          await appendAuditLogsToSheet(token, activeMeta.spreadsheetId, newAuditEntries);
        }
      }

      const nowFormatted = formatDateTimeDisplay(new Date().toISOString());
      setLastSyncedAt(nowFormatted);
      setSyncError(null);

      const updatedMeta: ConnectedSheetMetadata = {
        ...activeMeta,
        spreadsheetName: spreadsheetName || activeMeta.spreadsheetName,
        lastSyncedAt: nowFormatted,
      };
      setConnectedSheetMeta(updatedMeta);
      saveConnectedSheetMeta(updatedMeta);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isUnauth =
        errMsg.includes('401') ||
        errMsg.includes('403') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.toLowerCase().includes('permission');
      if (isUnauth) {
        localStorage.removeItem('s3_access_token');
        setSyncError('Google authentication token or permission expired. Please click "Google Sheets Integration" to re-authenticate.');
      } else {
        console.warn('Notice loading from Google Sheet:', err);
        setSyncError('Unable to retrieve data from the connected Google Sheet. Please check the connection and try again.');
      }
    }
  };

  // Automatic Google Sheets sync helper
  const performAutoSync = async (
    currentInvoices: Invoice[],
    customMeta?: ConnectedSheetMetadata | null
  ) => {
    const meta = customMeta !== undefined ? customMeta : connectedSheetMeta;
    if (!meta) return;

    const token = getCachedAccessToken();
    if (!token) return;

    try {
      // Write current Payment Schedule, Urgency Status & Payment Status records
      await syncToConnectedSheet(token, meta.spreadsheetId, currentInvoices);

      const nowFormatted = formatDateTimeDisplay(new Date().toISOString());
      setLastSyncedAt(nowFormatted);
      setSyncError(null);

      const updatedMeta: ConnectedSheetMetadata = {
        ...meta,
        lastSyncedAt: nowFormatted,
      };
      setConnectedSheetMeta(updatedMeta);
      saveConnectedSheetMeta(updatedMeta);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isUnauth =
        errMsg.includes('401') ||
        errMsg.includes('403') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.toLowerCase().includes('permission');
      if (isUnauth) {
        localStorage.removeItem('s3_access_token');
        setSyncError('Google authentication token or permission expired. Please click "Google Sheets Integration" to re-authenticate.');
      } else if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Google Sheets API rate limit reached during auto-sync:', errMsg);
        setSyncError('Google Sheets API rate limit reached. Retrying on next user action.');
      } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('500') || errMsg.includes('502')) {
        console.warn('Google Sheets API service temporarily unavailable during auto-sync:', errMsg);
        setSyncError('Google Sheets API is temporarily unavailable (503). Retrying on next action.');
      } else {
        console.warn('Auto sync notice:', err);
        setSyncError('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
      }
    }
  };

  // Auth initialization & Google Sheet data restoration
  useEffect(() => {
    initGoogleAuth(async (_user, token) => {
      let meta = getConnectedSheetMeta();
      if (!meta?.spreadsheetId && token) {
        try {
          const bhFile = await findBoonHuatDatabaseId(token);
          if (bhFile) {
            meta = {
              spreadsheetId: bhFile.id,
              spreadsheetName: bhFile.name,
              spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${bhFile.id}/edit`,
              worksheets: ['Payment Schedule', 'Urgency Status', 'Payment Status'],
              lastSyncedAt: formatDateTimeDisplay(new Date().toISOString()),
            };
            saveConnectedSheetMeta(meta);
            setConnectedSheetMeta(meta);
          }
        } catch (e) {
          console.warn('Auto-detect Boon Huat AP Database notice:', e);
        }
      }

      if (meta?.spreadsheetId && token) {
        loadFromConnectedSheet(meta);
      }
    });
  }, []);

  // Restore and refresh data from active Google Sheet when switching tabs
  useEffect(() => {
    if ((activeTab === 'review' || activeTab === 'dashboard') && connectedSheetMeta) {
      loadFromConnectedSheet();
    }
  }, [activeTab]);

  // Re-evaluate invoices in-memory when reference date changes
  useEffect(() => {
    if (invoices.length === 0) return;
    setInvoices((prev) => {
      const evaluated = evaluateInvoices(prev, new Date());
      const sorted = sortInvoicesForSchedule(evaluated);
      updateInvoicesAndCache(sorted);
      return sorted;
    });
  }, [referenceDate]);

  // Recalculate Days Remaining automatically in memory on calendar date changes or window visibility changes
  useEffect(() => {
    const checkAndRecalculate = () => {
      const todayIso = getTodayDateIso();
      setReferenceDate((prevDate) => {
        if (prevDate !== todayIso) {
          return todayIso;
        }
        return prevDate;
      });

      setInvoices((prev) => {
        if (prev.length === 0) return prev;
        const now = new Date();
        const evaluated = evaluateInvoices(prev, now);
        const sorted = sortInvoicesForSchedule(evaluated);
        updateInvoicesAndCache(sorted);
        return sorted;
      });
    };

    const intervalId = setInterval(checkAndRecalculate, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndRecalculate();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Compute summary metrics for active matched & unpaid invoices
  const summary = useMemo(() => computeScheduleSummary(invoices), [invoices]);

  // Counts for pending approval
  const matchedInvoices = useMemo(
    () => invoices.filter((inv) => inv.matchingStatus === 'Matched'),
    [invoices]
  );

  const pendingApprovalCount = useMemo(
    () => matchedInvoices.filter((inv) => inv.paymentStatus === 'Pending Approval').length,
    [matchedInvoices]
  );

  // Refresh Schedule
  const handleRefreshSchedule = () => {
    if (invoices.length === 0) return;
    setInvoices((prev) => {
      const evaluated = evaluateInvoices(prev, new Date());
      const sorted = sortInvoicesForSchedule(evaluated);
      if (connectedSheetMeta) {
        performAutoSync(sorted);
      }
      return sorted;
    });
    setLastRefreshedAt(formatDateTimeDisplay(new Date().toISOString()));
  };

  // Helper to add genuinely new eligible invoices from Payment Queue
  const handleAddEligibleInvoices = (newInvoices: Invoice[]) => {
    if (newInvoices.length === 0) return;

    const existingNumbers = new Set(invoices.map((inv) => inv.invoiceNumber.trim().toLowerCase()));
    const filteredNew = newInvoices.filter(
      (inv) => !existingNumbers.has(inv.invoiceNumber.trim().toLowerCase())
    );

    if (filteredNew.length === 0) return;

    const combined = [...invoices, ...filteredNew];
    const evaluated = evaluateInvoices(combined, new Date());
    const sorted = sortInvoicesForSchedule(evaluated);

    updateInvoicesAndCache(sorted);

    const nowIso = new Date().toISOString();
    const formattedNow = formatDateTimeDisplay(nowIso);
    setLastSyncedAt(formattedNow);

    if (connectedSheetMeta) {
      performAutoSync(sorted);
    }

    const recAudit: AuditRecord = {
      id: `audit-rec-${Date.now()}`,
      invoiceNumber: 'MATCHING_QUEUE',
      supplierName: 'Matching Results Queue',
      previousStatus: 'None',
      newStatus: 'Pending Approval',
      action: 'Reconciled & Added',
      user: 'Madam Lim',
      dateTime: nowIso,
      comments: `Retrieved ${filteredNew.length} new matched & approved invoices from Matching Results.`,
    };

    setAuditLogs((prev) => [recAudit, ...prev]);
  };

  // Helper to re-read Matching Results from connected sheet
  const handleRefreshMatchingResults = async () => {
    if (!connectedSheetMeta?.spreadsheetId) return null;
    const token = getCachedAccessToken();
    if (!token) return null;
    try {
      const readResult = await readFromConnectedSheet(token, connectedSheetMeta.spreadsheetId);
      if (readResult) {
        setSyncError(null);
      }
      return readResult;
    } catch (err: any) {
      console.warn('Error refreshing matching results:', err);
      const errMsg = String(err?.message || '');
      if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        setSyncError('Google Sheets API rate limit reached. Please wait a minute before retrying.');
      }
      return null;
    }
  };

  // Incremental Upload file handler
  const handleFileUpload = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const result = parseMatchedInvoicesFile(buffer);

      // Unique identifier set of existing invoice numbers in system
      const existingNumbers = new Set(invoices.map((inv) => inv.invoiceNumber.trim().toLowerCase()));

      const newInvoices: Invoice[] = [];
      let ignoredCount = 0;

      result.invoices.forEach((uploadedInv) => {
        const numKey = uploadedInv.invoiceNumber.trim().toLowerCase();
        if (numKey && existingNumbers.has(numKey)) {
          ignoredCount++;
        } else if (numKey) {
          newInvoices.push(uploadedInv);
        }
      });

      const addedCount = newInvoices.length;

      // Incremental append: keep existing records intact and append only new ones
      const combined = [...invoices, ...newInvoices];
      const evaluated = evaluateInvoices(combined, new Date());
      const sorted = sortInvoicesForSchedule(evaluated);

      updateInvoicesAndCache(sorted);
      setUploadedFileName(file.name);
      setLastImportResult({ addedCount, ignoredCount });

      const nowIso = new Date().toISOString();
      const formattedNow = formatDateTimeDisplay(nowIso);
      setLastSyncedAt(formattedNow);
      setLastRefreshedAt(formattedNow);

      // Sync incrementally updated dataset to Google Sheet
      if (connectedSheetMeta) {
        performAutoSync(sorted);
      }

      // Append upload audit record
      const uploadAudit: AuditRecord = {
        id: `audit-upload-${Date.now()}`,
        invoiceNumber: 'IMPORT_BATCH',
        supplierName: 'Matched Database Import',
        previousStatus: 'None',
        newStatus: 'Pending Approval',
        action: 'Database Imported',
        user: 'Madam Lim',
        dateTime: nowIso,
        comments: `Imported file "${file.name}". Added ${addedCount} new matched invoices, ignored ${ignoredCount} existing duplicate records.`,
      };

      setAuditLogs((prev) => [uploadAudit, ...prev]);
    } catch (err) {
      alert('Error parsing uploaded file. Please ensure it is a valid Excel or CSV file.');
      console.error(err);
    }
  };

  // Google Sheet connect success handler
  const handleConnectSuccess = async (meta: ConnectedSheetMetadata) => {
    setConnectedSheetMeta(meta);
    if (meta.lastSyncedAt) {
      setLastSyncedAt(meta.lastSyncedAt);
    }

    await loadFromConnectedSheet(meta);

    const nowIso = new Date().toISOString();
    const connectAudit: AuditRecord = {
      id: `audit-gs-${Date.now()}`,
      invoiceNumber: 'ALL_EXPORTED',
      supplierName: 'Google Sheets Connection',
      previousStatus: 'None',
      newStatus: 'Pending Approval',
      action: 'Connected Google Sheet',
      user: 'Madam Lim',
      dateTime: nowIso,
      comments: `Connected Google Sheet "${meta.spreadsheetName}" as live persistent copy`,
    };
    setAuditLogs((prev) => [connectAudit, ...prev]);
  };

  // Status transition handler with audit logging
  const handleUpdateInvoiceStatus = async (
    invoiceId: string,
    newStatus: PaymentStatus,
    approverName: string,
    comments: string
  ) => {
    const targetInvoice = invoices.find((i) => i.id === invoiceId);
    if (!targetInvoice) return;

    const previousStatus = targetInvoice.paymentStatus;
    const nowIso = new Date().toISOString();

    // Prepare candidate updated invoice list
    const updatedInvoices = invoices.map((inv) => {
      if (inv.id !== invoiceId) return inv;

      let updatedApprovalDate = inv.approvalDate;
      let updatedProcessingDate = inv.processingDate;
      let updatedPaymentDate = inv.paymentDate;

      if (newStatus === 'Approved') {
        updatedApprovalDate = inv.approvalDate || nowIso;
      } else if (newStatus === 'Processing') {
        updatedApprovalDate = inv.approvalDate || nowIso;
        updatedProcessingDate = inv.processingDate || nowIso;
      } else if (newStatus === 'Paid') {
        updatedApprovalDate = inv.approvalDate || nowIso;
        updatedProcessingDate = inv.processingDate || nowIso;
        updatedPaymentDate = inv.paymentDate || nowIso;
      }

      const updated = {
        ...inv,
        paymentStatus: newStatus,
        approverName: approverName || 'Madam Lim',
        comments: comments || inv.comments,
        approvalDate: updatedApprovalDate,
        processingDate: updatedProcessingDate,
        paymentDate: updatedPaymentDate,
      };

      return validateInvoicePaymentStatus(updated);
    });

    const reEvaluated = evaluateInvoices(updatedInvoices, new Date());
    const sorted = sortInvoicesForSchedule(reEvaluated);

    // Write back to Google Sheets if connected
    if (connectedSheetMeta) {
      const token = getCachedAccessToken();
      if (token && sorted.length > 0) {
        try {
          await syncToConnectedSheet(token, connectedSheetMeta.spreadsheetId, sorted);
          await readFromConnectedSheet(token, connectedSheetMeta.spreadsheetId);

          // Append event to shared Audit Log worksheet
          let sharedAction = 'Payment Status Updated';
          let sharedDetails = comments || `Status updated from ${previousStatus} to ${newStatus}.`;

          if (newStatus === 'Approved') {
            sharedAction = 'Payment Approved';
            sharedDetails = 'Invoice approved for payment by Accounts Executive.';
          } else if (newStatus === 'Processing') {
            sharedAction = 'Payment Processing Started';
            sharedDetails = 'Payment processing initiated.';
          } else if (newStatus === 'Paid') {
            sharedAction = 'Payment Completed';
            sharedDetails = 'Invoice payment successfully completed.';
          } else if (newStatus === 'Rejected') {
            sharedAction = 'Payment Rejected';
            sharedDetails = comments || 'Rejected due to unresolved invoice discrepancy.';
          }

          const sharedAuditEntry: SharedAuditEntry = {
            timestamp: formatDateTimeDisplay(nowIso),
            invoiceNumber: targetInvoice.invoiceNumber,
            poNumber: targetInvoice.poNumber || 'N/A',
            performedBy: approverName || 'Madam Lim',
            role: 'Accounts Executive',
            module: 'Payment Management',
            action: sharedAction,
            previousStatus,
            newStatus,
            details: sharedDetails,
          };

          await appendAuditLogsToSheet(token, connectedSheetMeta.spreadsheetId, [sharedAuditEntry]);

          const formattedNow = formatDateTimeDisplay(nowIso);
          setLastSyncedAt(formattedNow);
          setSyncError(null);
          const updatedMeta = { ...connectedSheetMeta, lastSyncedAt: formattedNow };
          setConnectedSheetMeta(updatedMeta);
          saveConnectedSheetMeta(updatedMeta);
        } catch (err: any) {
          console.error('Status sync error:', err);
          setSyncError('Automatic Google Sheets sync failed. Please try Sync Now.');
          alert('Automatic Google Sheets sync failed. Please try Sync Now.');
          return;
        }
      }
    }

    setInvoices(sorted);

    let actionName = 'Status Updated';
    if (newStatus === 'Approved') actionName = 'Approved for Payment';
    else if (newStatus === 'Processing') actionName = 'Marked as Processing';
    else if (newStatus === 'Paid') actionName = 'Marked as Paid';

    const newAuditRecord: AuditRecord = {
      id: `audit-${Date.now()}`,
      invoiceNumber: targetInvoice.invoiceNumber,
      supplierName: targetInvoice.supplierName,
      previousStatus,
      newStatus,
      action: actionName,
      user: approverName || 'Madam Lim',
      dateTime: nowIso,
      comments: comments || 'Status updated by Madam Lim.',
    };

    setAuditLogs((prev) => [newAuditRecord, ...prev]);
  };

  const isFullyConnected = Boolean(getCachedAccessToken() && connectedSheetMeta?.spreadsheetId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header Layout: Two-Level Header */}
      <header className="bg-[#0b1329] text-white shrink-0 shadow-md">
        {/* Level 1: Slim Dark Navy Top Navigation Bar */}
        <div className="border-b border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4 text-xs">
            {/* Left: Company Branding */}
            <div className="flex items-center space-x-2 shrink-0">
              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="font-medium text-xs text-slate-200/90 tracking-normal">
                Boon Huat Hardware &amp; Supplies Pte Ltd
              </span>
            </div>

            {/* Right: Connection Controls & Profile Section */}
            <div className="flex items-center space-x-3 shrink-0">
              {/* 1. Google Workspace Connection Status */}
              <div className="flex items-center space-x-2 bg-slate-800/60 border border-slate-700/80 px-2.5 py-1.5 rounded-lg shrink-0">
                <span className="relative flex h-2 w-2">
                  {isFullyConnected ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
                  )}
                </span>
                <span className={`font-semibold text-xs whitespace-nowrap ${isFullyConnected ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {isFullyConnected ? 'Google Workspace Connected' : 'Google Workspace Disconnected'}
                </span>
              </div>

              {/* 2. Google Sign-in Button/Status */}
              <button
                onClick={() => setGoogleSheetModalOpen(true)}
                className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer shrink-0 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
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
                <span>{isFullyConnected ? 'Signed in with Google' : 'Sign in with Google'}</span>
              </button>

              {/* 3. Open Connected Google Sheet */}
              <button
                onClick={() => {
                  if (isFullyConnected && connectedSheetMeta?.spreadsheetUrl) {
                    window.open(connectedSheetMeta.spreadsheetUrl, '_blank');
                  }
                }}
                disabled={!isFullyConnected}
                className={`inline-flex items-center space-x-1.5 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all shrink-0 whitespace-nowrap ${
                  isFullyConnected
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-2xs cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 opacity-60 cursor-not-allowed'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Open Connected Google Sheet</span>
              </button>

              {/* 4. Madam Lim Profile Badge */}
              <div className="flex items-center space-x-2.5 bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1 shrink-0 whitespace-nowrap">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  ML
                </div>
                <div className="flex flex-col text-left leading-tight justify-center">
                  <span className="text-xs font-bold text-slate-100">Madam Lim</span>
                  <span className="text-[10px] text-slate-400 font-normal">Accounts Executive</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Level 2: Main Title Banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-2">
          {/* Accounts Payable Badge */}
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/30 text-blue-300 text-[11px] font-bold tracking-wider uppercase">
            <Shield className="w-3 h-3 text-blue-400 shrink-0" />
            <span>ACCOUNTS PAYABLE</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Payment Management System
          </h1>

          <p className="text-xs sm:text-sm text-slate-300/90 font-normal">
            Manage payment approvals, scheduling and supplier payments.
          </p>
        </div>
      </header>

      {/* Sync Failure Banner */}
      {syncError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 flex items-center justify-between text-xs text-amber-900 font-semibold shrink-0">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            onClick={() => setSyncError(null)}
            className="text-amber-700 hover:text-amber-950 font-bold ml-4 underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Page Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Centered Horizontal Segmented Navigation Bar */}
        <div className="flex justify-center my-6">
          <div className="w-full sm:w-[78%] max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 p-1.5 bg-slate-100/70 rounded-xl border border-slate-200 shadow-2xs">
            {/* Tab 1: Payment Queue */}
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center flex items-center justify-center ${
                activeTab === 'import'
                  ? 'bg-[#0b1329] text-white shadow-xs'
                  : 'bg-white text-[#0b1329] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Payment Queue
            </button>

            {/* Tab 2: Review & Process */}
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center flex items-center justify-center ${
                activeTab === 'review'
                  ? 'bg-[#0b1329] text-white shadow-xs'
                  : 'bg-white text-[#0b1329] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Review &amp; Process
            </button>

            {/* Tab 3: Dashboard */}
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center flex items-center justify-center ${
                activeTab === 'dashboard'
                  ? 'bg-[#0b1329] text-white shadow-xs'
                  : 'bg-white text-[#0b1329] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Dashboard
            </button>
          </div>
        </div>

        {/* Single Content Area based on Active Tab */}
        <div>
          {activeTab === 'import' && (
            <ImportInvoicesView
              invoices={invoices}
              totalMatchingRows={matchingStats.totalMatchingRows}
              recordsExcluded={matchingStats.recordsExcluded}
              connectedSheetMeta={connectedSheetMeta}
              onOpenGoogleSheetModal={() => setGoogleSheetModalOpen(true)}
              onNavigateToReview={() => setActiveTab('review')}
              onResyncMatchingResults={() => loadFromConnectedSheet()}
              sheetReadError={syncError}
              onConnectSheetSuccess={(meta) => {
                setConnectedSheetMeta(meta);
                loadFromConnectedSheet(meta);
              }}
            />
          )}

          {activeTab === 'review' && (
            <ReviewAndProcessView
              invoices={invoices}
              onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
              referenceDate={referenceDate}
              onNavigateToImport={() => setActiveTab('import')}
              selectedInvoiceId={selectedInvoiceForApprovalId}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              invoices={invoices}
              summary={summary}
              onRefreshSchedule={handleRefreshSchedule}
              referenceDate={referenceDate}
              lastRefreshedAt={lastRefreshedAt}
              onReferenceDateChange={(d) => setReferenceDate(d)}
              onNavigateToImport={() => setActiveTab('import')}
              onOpenGoogleSheetModal={() => setGoogleSheetModalOpen(true)}
              lastSyncedAt={lastSyncedAt}
              connectedSheetName={connectedSheetMeta?.spreadsheetName}
              connectedSpreadsheetId={connectedSheetMeta?.spreadsheetId}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Boon Huat Hardware &amp; Supplies Pte Ltd</strong> • Solution 3 Payment Assistant
          </div>
          <div>
            Madam Lim Approval Control • {connectedSheetMeta ? `Connected to Google Sheet "${connectedSheetMeta.spreadsheetName}"` : 'Live Database Ready'}
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuditTrailModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        auditLogs={auditLogs}
        filterInvoiceNumber={auditFilterInvoiceNumber}
      />

      <GoogleSheetModal
        isOpen={googleSheetModalOpen}
        onClose={() => setGoogleSheetModalOpen(false)}
        onConnectSuccess={handleConnectSuccess}
        lastSyncedAt={lastSyncedAt}
        invoices={invoices}
      />
    </div>
  );
}
