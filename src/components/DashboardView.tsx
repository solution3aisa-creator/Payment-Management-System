import React, { useState } from 'react';
import { Invoice, ScheduleSummary } from '../types';
import { formatCurrency, formatDateDisplay, formatDateTimeDisplay } from '../utils/calculations';
import { getCachedAccessToken, loadInvoicesFromConnectedSheet } from '../utils/googleSheets';
import { SendSummaryEmailModal, EmailSummaryData } from './SendSummaryEmailModal';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  RefreshCw,
  FileSpreadsheet,
  UploadCloud,
  PieChart,
  Layers,
  BarChart3,
  ShieldCheck,
  PlayCircle,
  FileCheck,
  Mail,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';

interface DashboardViewProps {
  invoices: Invoice[];
  summary: ScheduleSummary;
  onRefreshSchedule: () => void;
  referenceDate: string;
  lastRefreshedAt: string;
  onReferenceDateChange: (date: string) => void;
  onNavigateToImport: () => void;
  onOpenGoogleSheetModal: () => void;
  lastSyncedAt?: string;
  connectedSheetName?: string;
  connectedSpreadsheetId?: string;
}

function DashboardMetricCard({
  label,
  labelBadgeStyle = 'text-slate-700 bg-slate-100 border-slate-200',
  badgeCount,
  amount,
  subtitle,
  className = '',
}: {
  label: string;
  labelBadgeStyle?: string;
  badgeCount?: number | string;
  amount: string;
  subtitle: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between h-28 w-full ${className}`}>
      {/* Top Header Row: Title badge on left, count badge on right (or placeholder) */}
      <div className="flex items-center justify-between h-6 shrink-0">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${labelBadgeStyle}`}
        >
          {label}
        </span>
        {badgeCount !== undefined ? (
          <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
            {badgeCount}
          </span>
        ) : (
          <div className="h-5 w-1" />
        )}
      </div>

      {/* Main Body: Amount and Subtitle */}
      <div className="shrink-0 space-y-0.5">
        <div className="text-xl font-bold text-slate-900 truncate tracking-tight">
          {amount}
        </div>
        <div className="text-xs text-slate-500 font-normal truncate leading-tight">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  invoices,
  summary,
  onRefreshSchedule,
  referenceDate,
  lastRefreshedAt,
  onReferenceDateChange,
  onNavigateToImport,
  onOpenGoogleSheetModal,
  lastSyncedAt,
  connectedSheetName,
  connectedSpreadsheetId,
}) => {
  const [isPreparingSummary, setIsPreparingSummary] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<EmailSummaryData | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const isDatabaseUploaded = invoices.length > 0;

  const matchedInvoices = invoices.filter((inv) => inv.matchingStatus === 'Matched');
  const pendingApprovalInvoices = matchedInvoices.filter((inv) => inv.paymentStatus === 'Pending Approval');
  const approvedInvoices = matchedInvoices.filter((inv) => inv.paymentStatus === 'Approved');
  const processingInvoices = matchedInvoices.filter((inv) => inv.paymentStatus === 'Processing');
  const paidInvoices = matchedInvoices.filter((inv) => inv.paymentStatus === 'Paid');

  // Value by status
  const pendingValue = pendingApprovalInvoices.reduce((sum, i) => sum + i.invoiceTotal, 0);
  const approvedValue = approvedInvoices.reduce((sum, i) => sum + i.invoiceTotal, 0);
  const processingValue = processingInvoices.reduce((sum, i) => sum + i.invoiceTotal, 0);
  const paidValue = paidInvoices.reduce((sum, i) => sum + i.invoiceTotal, 0);

  const handlePrepareEmailSummary = async () => {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsPreparingSummary(true);

    try {
      const token = getCachedAccessToken();
      const spreadsheetId = connectedSpreadsheetId;

      if (!token || !spreadsheetId) {
        setErrorMessage(
          'Unable to retrieve the latest Payment Schedule. Please check the Google connection and try again.'
        );
        setIsPreparingSummary(false);
        return;
      }

      // Read latest live records from the connected Google Sheet
      const { invoices: liveInvoices } = await loadInvoicesFromConnectedSheet(
        token,
        spreadsheetId
      );

      // Exclude any invoice already marked Paid in Payment Status worksheet
      const activeUnpaid = liveInvoices.filter((inv) => inv.paymentStatus !== 'Paid');

      if (activeUnpaid.length === 0) {
        setNoticeMessage(
          'There are currently no active unpaid invoices to include in the payment schedule summary.'
        );
        setIsPreparingSummary(false);
        return;
      }

      // Calculate Days Remaining and Urgency Status based on current reference Date
      const processedInvoices = activeUnpaid.map((inv) => {
        let daysDiff = 0;
        if (inv.paymentDueDate) {
          const due = new Date(inv.paymentDueDate);
          const ref = new Date(referenceDate);
          const timeDiff = due.getTime() - ref.getTime();
          daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        }

        let urgencyStatus: 'Overdue' | 'Urgent' | 'Upcoming' | 'Not Due Yet' = 'Not Due Yet';
        let recommendation = 'Monitor and Schedule Later';

        if (daysDiff < 0) {
          urgencyStatus = 'Overdue';
          recommendation = 'Approve & Pay Immediately';
        } else if (daysDiff <= 3) {
          urgencyStatus = 'Urgent';
          recommendation = 'Approve for Payment';
        } else if (daysDiff <= 14) {
          urgencyStatus = 'Upcoming';
          recommendation = 'Review & Schedule Payment';
        } else {
          urgencyStatus = 'Not Due Yet';
          recommendation = 'Monitor and Schedule Later';
        }

        const daysRemainingText =
          daysDiff < 0
            ? `${daysDiff} days`
            : daysDiff === 0
            ? '0 days (Today)'
            : `${daysDiff} days`;

        return {
          supplierName: inv.supplierName || '',
          invoiceNumber: inv.invoiceNumber || '',
          poNumber: inv.poNumber || '',
          invoiceTotal: inv.invoiceTotal || 0,
          paymentDueDate: inv.paymentDueDate || '',
          daysRemaining: daysDiff,
          daysRemainingText,
          urgencyStatus,
          recommendation,
        };
      });

      // Sort remaining invoices by:
      // 1. Overdue
      // 2. Urgent
      // 3. Upcoming
      // 4. Not Due Yet
      // 5. Earliest Due Date within each category
      const tierOrder: Record<string, number> = {
        Overdue: 1,
        Urgent: 2,
        Upcoming: 3,
        'Not Due Yet': 4,
      };

      processedInvoices.sort((a, b) => {
        const orderA = tierOrder[a.urgencyStatus] || 5;
        const orderB = tierOrder[b.urgencyStatus] || 5;
        if (orderA !== orderB) return orderA - orderB;

        const dateA = a.paymentDueDate ? new Date(a.paymentDueDate).getTime() : Infinity;
        const dateB = b.paymentDueDate ? new Date(b.paymentDueDate).getTime() : Infinity;
        return dateA - dateB;
      });

      // Compute summary statistics
      const totalUnpaidCount = processedInvoices.length;
      const totalUnpaidValue = processedInvoices.reduce((sum, i) => sum + i.invoiceTotal, 0);

      const overdueInvoices = processedInvoices.filter((i) => i.urgencyStatus === 'Overdue');
      const urgentInvoices = processedInvoices.filter((i) => i.urgencyStatus === 'Urgent');
      const upcomingInvoices = processedInvoices.filter((i) => i.urgencyStatus === 'Upcoming');
      const notDueInvoices = processedInvoices.filter((i) => i.urgencyStatus === 'Not Due Yet');

      const dataForModal: EmailSummaryData = {
        evaluationDate: formatDateDisplay(referenceDate),
        totalUnpaidCount,
        totalUnpaidValue,
        overdueCount: overdueInvoices.length,
        overdueValue: overdueInvoices.reduce((s, i) => s + i.invoiceTotal, 0),
        urgentCount: urgentInvoices.length,
        urgentValue: urgentInvoices.reduce((s, i) => s + i.invoiceTotal, 0),
        upcomingCount: upcomingInvoices.length,
        upcomingValue: upcomingInvoices.reduce((s, i) => s + i.invoiceTotal, 0),
        notDueCount: notDueInvoices.length,
        notDueValue: notDueInvoices.reduce((s, i) => s + i.invoiceTotal, 0),
        invoices: processedInvoices,
      };

      setSummaryData(dataForModal);
      setIsSummaryModalOpen(true);
    } catch (err) {
      console.error('Error reading Payment Schedule for email summary:', err);
      setErrorMessage(
        'Unable to retrieve the latest Payment Schedule. Please check the Google connection and try again.'
      );
    } finally {
      setIsPreparingSummary(false);
    }
  };

  if (!isDatabaseUploaded) {
    return (
      <div className="bg-white rounded-xl p-10 border border-slate-200 shadow-2xs text-center space-y-6">
        <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center mx-auto border border-slate-200">
          <BarChart3 className="w-6 h-6" />
        </div>

        <div className="max-w-md mx-auto space-y-1.5">
          <h2 className="text-base font-semibold text-slate-900">
            No payment data available for dashboard analysis.
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Please import a Matched Invoice Database in Step 1 (Import Matched Invoices) to generate executive payment reports and metrics.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <button
            onClick={onNavigateToImport}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Go to Import Matched Invoices</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Error Message Toast/Banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-xs text-red-800 shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:text-red-800 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notice Message Toast/Banner */}
      {noticeMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between text-xs text-blue-800 shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-medium">{noticeMessage}</span>
          </div>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-blue-600 hover:text-blue-800 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dashboard Control Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">Payment Monitoring Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Executive overview of payment schedules, cashflow commitments, and workflow completion statistics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Evaluation Date Picker */}
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <label htmlFor="ref-date-dash" className="text-xs font-medium text-slate-600">
              Evaluation Date:
            </label>
            <input
              id="ref-date-dash"
              type="date"
              value={referenceDate}
              onChange={(e) => onReferenceDateChange(e.target.value)}
              className="bg-transparent font-medium text-xs text-slate-900 focus:outline-hidden cursor-pointer"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefreshSchedule}
            className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            title={`Last refreshed: ${lastRefreshedAt}`}
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            <span>Refresh</span>
          </button>

          {/* Send Payment Schedule Summary Button */}
          <button
            type="button"
            onClick={handlePrepareEmailSummary}
            disabled={isPreparingSummary}
            className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
          >
            {isPreparingSummary ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Preparing summary…</span>
              </>
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" />
                <span>Send Payment Schedule Summary</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Urgency Summary Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-slate-500" />
          <span>Urgency Schedule Summary</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <DashboardMetricCard
            label="Overdue"
            labelBadgeStyle="text-red-700 bg-red-50 border-red-200"
            amount={formatCurrency(summary.overdueTotal)}
            subtitle={
              <>
                <span className="font-semibold text-slate-700">{summary.overdueCount}</span>{' '}
                {summary.overdueCount === 1 ? 'invoice' : 'invoices'} overdue
              </>
            }
          />

          <DashboardMetricCard
            label="Urgent (0–3d)"
            labelBadgeStyle="text-amber-800 bg-amber-50 border-amber-200"
            amount={formatCurrency(summary.urgentTotal)}
            subtitle={
              <>
                <span className="font-semibold text-slate-700">{summary.urgentCount}</span>{' '}
                {summary.urgentCount === 1 ? 'invoice' : 'invoices'} due ≤3d
              </>
            }
          />

          <DashboardMetricCard
            label="Upcoming (4–14d)"
            labelBadgeStyle="text-blue-800 bg-blue-50 border-blue-200"
            amount={formatCurrency(summary.upcomingTotal)}
            subtitle={
              <>
                <span className="font-semibold text-slate-700">{summary.upcomingCount}</span>{' '}
                {summary.upcomingCount === 1 ? 'invoice' : 'invoices'} due 4–14d
              </>
            }
          />

          <DashboardMetricCard
            label="Not Due Yet (>14d)"
            labelBadgeStyle="text-emerald-800 bg-emerald-50 border-emerald-200"
            amount={formatCurrency(summary.notDueYetTotal)}
            subtitle={
              <>
                <span className="font-semibold text-slate-700">{summary.notDueYetCount}</span>{' '}
                {summary.notDueYetCount === 1 ? 'invoice' : 'invoices'} due &gt;14d
              </>
            }
          />

          <DashboardMetricCard
            className="col-span-1 md:col-span-2"
            label="Total Pending Payment"
            labelBadgeStyle="text-slate-700 bg-slate-100 border-slate-200"
            amount={formatCurrency(summary.pendingTotalValue)}
            subtitle={
              <>
                Across{' '}
                <span className="font-semibold text-slate-700">
                  {matchedInvoices.filter((i) => i.paymentStatus !== 'Paid').length}
                </span>{' '}
                active unpaid invoices
              </>
            }
          />
        </div>
      </div>

      {/* Payment Stage Overview Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <PieChart className="w-4 h-4 text-slate-500" />
          <span>Payment Stage Overview</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <DashboardMetricCard
            label="Pending Approval"
            badgeCount={pendingApprovalInvoices.length}
            amount={formatCurrency(pendingValue)}
            subtitle="Awaiting approval in Step 2"
          />

          <DashboardMetricCard
            label="Approved for Payment"
            badgeCount={approvedInvoices.length}
            amount={formatCurrency(approvedValue)}
            subtitle="Authorized for bank instruction"
          />

          <DashboardMetricCard
            label="Processing"
            badgeCount={processingInvoices.length}
            amount={formatCurrency(processingValue)}
            subtitle="Bank submission in progress"
          />

          <DashboardMetricCard
            label="Paid"
            badgeCount={paidInvoices.length}
            amount={formatCurrency(paidValue)}
            subtitle="Settled and completed"
          />
        </div>
      </div>

      {/* Send Payment Schedule Summary Modal */}
      <SendSummaryEmailModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summaryData={summaryData}
        onError={(msg) => setErrorMessage(msg)}
      />
    </div>
  );
};
