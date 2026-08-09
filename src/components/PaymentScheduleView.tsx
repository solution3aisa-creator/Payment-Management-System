import React, { useState, useRef, useEffect } from 'react';
import { Invoice, UrgencyTier, ScheduleSummary, PaymentStatus } from '../types';
import { formatCurrency, formatDateDisplay, formatDateTimeDisplay } from '../utils/calculations';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  HelpCircle,
  UploadCloud,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  Check,
  UserCheck,
  MessageSquare,
  ShieldCheck,
  PlayCircle,
  FileCheck,
  X,
} from 'lucide-react';

interface PaymentScheduleViewProps {
  invoices: Invoice[];
  summary: ScheduleSummary;
  onRefreshSchedule: () => void;
  onUpdateInvoiceStatus: (
    invoiceId: string,
    newStatus: PaymentStatus,
    approverName: string,
    comments: string
  ) => void;
  referenceDate: string;
  lastRefreshedAt: string;
  onReferenceDateChange?: (date: string) => void;
  onFileUpload: (file: File) => void;
  onOpenGoogleSheetModal: () => void;
  selectedInvoiceId?: string | null;
}

export const PaymentScheduleView: React.FC<PaymentScheduleViewProps> = ({
  invoices,
  summary,
  onRefreshSchedule,
  onUpdateInvoiceStatus,
  referenceDate,
  lastRefreshedAt,
  onReferenceDateChange,
  onFileUpload,
  onOpenGoogleSheetModal,
  selectedInvoiceId,
}) => {
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('Pending Approval');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow Modal state
  const [modalInvoice, setModalInvoice] = useState<{
    invoice: Invoice;
    targetStatus: PaymentStatus | 'View';
    actionTitle: string;
  } | null>(null);

  const [approverInput, setApproverInput] = useState<string>('Madam Lim');
  const [commentsInput, setCommentsInput] = useState<string>('');

  // Auto-select invoice if passed from props
  useEffect(() => {
    if (selectedInvoiceId) {
      const inv = invoices.find((i) => i.id === selectedInvoiceId);
      if (inv) {
        if (inv.paymentStatus) {
          setSelectedStatus(inv.paymentStatus);
        }
        handleOpenActionModal(inv);
      }
    }
  }, [selectedInvoiceId, invoices]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const isDatabaseUploaded = invoices.length > 0;

  // Filter matched invoices across all payment stages
  const matchedInvoices = invoices.filter((inv) => inv.matchingStatus === 'Matched');

  // Status stage counts
  const pendingCount = matchedInvoices.filter((i) => i.paymentStatus === 'Pending Approval').length;
  const approvedCount = matchedInvoices.filter((i) => i.paymentStatus === 'Approved').length;
  const processingCount = matchedInvoices.filter((i) => i.paymentStatus === 'Processing').length;
  const paidCount = matchedInvoices.filter((i) => i.paymentStatus === 'Paid').length;

  // Extract unique supplier names for filter
  const suppliers = Array.from(new Set(matchedInvoices.map((inv) => inv.supplierName))).sort();

  // Apply filters
  const filteredInvoices = matchedInvoices.filter((inv) => {
    const matchesUrgency = selectedUrgency === 'ALL' || inv.urgencyTier === selectedUrgency;
    const matchesSupplier = selectedSupplier === 'ALL' || inv.supplierName === selectedSupplier;
    const matchesStatus = selectedStatus === 'ALL' || inv.paymentStatus === selectedStatus;
    const matchesSearch =
      searchQuery.trim() === '' ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.supplierName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesUrgency && matchesSupplier && matchesStatus && matchesSearch;
  });

  // Action modal opener
  const handleOpenActionModal = (inv: Invoice) => {
    let targetStatus: PaymentStatus | 'View' = 'Approved';
    let actionTitle = 'Review & Approve Invoice';

    if (inv.paymentStatus === 'Pending Approval') {
      targetStatus = 'Approved';
      actionTitle = 'Review & Approve Invoice';
    } else if (inv.paymentStatus === 'Approved') {
      targetStatus = 'Processing';
      actionTitle = 'Mark Invoice as Processing';
    } else if (inv.paymentStatus === 'Processing') {
      targetStatus = 'Paid';
      actionTitle = 'Mark Invoice as Paid';
    } else {
      targetStatus = 'View';
      actionTitle = 'Payment Record Details';
    }

    setModalInvoice({
      invoice: inv,
      targetStatus,
      actionTitle,
    });

    setApproverInput(inv.approverName || 'Madam Lim');
    setCommentsInput(
      targetStatus === 'Approved'
        ? `Approved by Madam Lim after verifying line items against PO #${inv.poNumber}.`
        : targetStatus === 'Processing'
        ? `Payment instruction submitted for bank processing.`
        : targetStatus === 'Paid'
        ? `Payment settled and confirmed.`
        : inv.comments || 'Payment record verified.'
    );
  };

  const handleConfirmStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalInvoice || modalInvoice.targetStatus === 'View') {
      setModalInvoice(null);
      return;
    }

    onUpdateInvoiceStatus(
      modalInvoice.invoice.id,
      modalInvoice.targetStatus as PaymentStatus,
      approverInput.trim() || 'Madam Lim',
      commentsInput.trim() || 'Status updated by approver.'
    );

    setModalInvoice(null);
  };

  // Badge rendering helper for Urgency Status
  const getUrgencyBadge = (tier: UrgencyTier) => {
    switch (tier) {
      case 'Overdue':
        return (
          <span className="inline-flex items-center space-x-1 bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>Overdue</span>
          </span>
        );
      case 'Urgent':
        return (
          <span className="inline-flex items-center space-x-1 bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>Urgent (0-3d)</span>
          </span>
        );
      case 'Upcoming':
        return (
          <span className="inline-flex items-center space-x-1 bg-blue-50 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Upcoming (4-14d)</span>
          </span>
        );
      case 'Not Due Yet':
        return (
          <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Not Due Yet (&gt;14d)</span>
          </span>
        );
      case 'Needs Review':
        return (
          <span className="inline-flex items-center space-x-1 bg-purple-50 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200">
            <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
            <span>Needs Review</span>
          </span>
        );
    }
  };

  // Badge rendering for Payment Status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending Approval':
        return (
          <span className="bg-amber-50 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-md border border-amber-300 inline-flex items-center space-x-1">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>Pending Approval</span>
          </span>
        );
      case 'Approved':
        return (
          <span className="bg-indigo-50 text-indigo-900 text-xs font-bold px-2.5 py-1 rounded-md border border-indigo-200 inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-indigo-700" />
            <span>Approved</span>
          </span>
        );
      case 'Processing':
        return (
          <span className="bg-sky-50 text-sky-900 text-xs font-bold px-2.5 py-1 rounded-md border border-sky-200 inline-flex items-center space-x-1">
            <PlayCircle className="w-3 h-3 text-sky-700" />
            <span>Processing</span>
          </span>
        );
      case 'Paid':
        return (
          <span className="bg-emerald-50 text-emerald-900 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-200 inline-flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Paid</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-600 font-medium">{status}</span>;
    }
  };

  // Render Action Button based on Payment Status
  const renderActionButton = (inv: Invoice) => {
    switch (inv.paymentStatus) {
      case 'Pending Approval':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Review &amp; Approve</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Approved':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Mark as Processing</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Processing':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Mark as Paid</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Paid':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>View Record</span>
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Page Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Payment Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage upcoming payment schedules, urgency rankings, and Madam Lim's approval workflow
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Reference Date Picker */}
          {onReferenceDateChange && (
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <label htmlFor="ref-date-sched" className="text-[11px] font-medium text-slate-600">
                Evaluation Date:
              </label>
              <input
                id="ref-date-sched"
                type="date"
                value={referenceDate}
                onChange={(e) => onReferenceDateChange(e.target.value)}
                className="bg-transparent font-bold text-xs text-slate-900 focus:outline-hidden cursor-pointer"
              />
            </div>
          )}

          {isDatabaseUploaded && (
            <button
              onClick={onRefreshSchedule}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              title={`Last refreshed: ${lastRefreshedAt}`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Clean Empty State when no database has been uploaded */}
      {!isDatabaseUploaded ? (
        <div className="bg-white rounded-xl p-10 border border-slate-200 shadow-2xs text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-bold text-slate-900">
              No matched invoice database has been uploaded.
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload a Matched Invoice Database exported from Solution 2 to begin payment scheduling and workflow management.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Matched Invoice Database</span>
            </button>

            <button
              disabled
              className="flex items-center space-x-2 bg-slate-100 text-slate-400 font-semibold text-xs px-4 py-2.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-60"
            >
              <Eye className="w-4 h-4" />
              <span>Data Preview (disabled until upload)</span>
            </button>

            <button
              disabled
              className="flex items-center space-x-2 bg-slate-100 text-slate-400 font-semibold text-xs px-4 py-2.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Import Data (disabled until upload)</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Overdue Card */}
            <div
              onClick={() => setSelectedUrgency(selectedUrgency === 'Overdue' ? 'ALL' : 'Overdue')}
              className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                selectedUrgency === 'Overdue' ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-200 hover:border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-2 py-0.5 rounded-xs border border-red-200">
                  Overdue
                </span>
                <div className="p-2 bg-red-50 text-red-700 rounded-lg shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-slate-900 truncate">
                  {formatCurrency(summary.overdueTotal)}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  <span className="font-bold text-red-700">{summary.overdueCount}</span> {summary.overdueCount === 1 ? 'invoice' : 'invoices'} overdue
                </div>
              </div>
            </div>

            {/* Urgent Card */}
            <div
              onClick={() => setSelectedUrgency(selectedUrgency === 'Urgent' ? 'ALL' : 'Urgent')}
              className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                selectedUrgency === 'Urgent' ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-xs border border-amber-200">
                  Urgent (0–3d)
                </span>
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-slate-900 truncate">
                  {formatCurrency(summary.urgentTotal)}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  <span className="font-bold text-amber-800">{summary.urgentCount}</span> {summary.urgentCount === 1 ? 'invoice' : 'invoices'} due in ≤3d
                </div>
              </div>
            </div>

            {/* Upcoming Card */}
            <div
              onClick={() => setSelectedUrgency(selectedUrgency === 'Upcoming' ? 'ALL' : 'Upcoming')}
              className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                selectedUrgency === 'Upcoming' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                  Upcoming (4–14d)
                </span>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-slate-900 truncate">
                  {formatCurrency(summary.upcomingTotal)}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  <span className="font-bold text-blue-800">{summary.upcomingCount}</span> {summary.upcomingCount === 1 ? 'invoice' : 'invoices'} due 4–14d
                </div>
              </div>
            </div>

            {/* Not Due Yet Card */}
            <div
              onClick={() => setSelectedUrgency(selectedUrgency === 'Not Due Yet' ? 'ALL' : 'Not Due Yet')}
              className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                selectedUrgency === 'Not Due Yet' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-xs border border-emerald-200">
                  NOT DUE YET (&gt;14 DAYS)
                </span>
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-slate-900 truncate">
                  {formatCurrency(summary.notDueYetTotal)}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  <span className="font-bold text-emerald-800">{summary.notDueYetCount}</span> {summary.notDueYetCount === 1 ? 'invoice' : 'invoices'} due &gt;14d
                </div>
              </div>
            </div>

            {/* Total Pending Payment Card */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded-xs border border-slate-200">
                  Total Pending Payment
                </span>
                <div className="p-2 bg-slate-100 text-slate-700 rounded-lg shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-slate-900 truncate">
                  {formatCurrency(summary.pendingTotalValue)}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  Across <span className="font-bold text-slate-900">{matchedInvoices.filter((i) => i.paymentStatus !== 'Paid').length}</span> active unpaid invoices
                </div>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Invoice Number, PO Number, or Supplier Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 outline-hidden bg-white"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Urgency Filter Dropdown */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
                  <label htmlFor="urgency-filter" className="font-semibold text-slate-600">Urgency:</label>
                  <select
                    id="urgency-filter"
                    value={selectedUrgency}
                    onChange={(e) => setSelectedUrgency(e.target.value)}
                    className="bg-transparent font-medium text-slate-900 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">All Tiers</option>
                    <option value="Overdue">Overdue ({summary.overdueCount})</option>
                    <option value="Urgent">Urgent ({summary.urgentCount})</option>
                    <option value="Upcoming">Upcoming ({summary.upcomingCount})</option>
                    <option value="Not Due Yet">Not Due Yet ({summary.notDueYetCount})</option>
                    <option value="Needs Review">Needs Review ({summary.needsReviewCount})</option>
                  </select>
                </div>

                {/* Supplier Filter Dropdown */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
                  <label htmlFor="supplier-filter" className="font-semibold text-slate-600">Supplier:</label>
                  <select
                    id="supplier-filter"
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="bg-transparent font-medium text-slate-900 focus:outline-hidden cursor-pointer max-w-[180px] truncate"
                  >
                    <option value="ALL">All Suppliers</option>
                    {suppliers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Clear Filter Button */}
                {(selectedUrgency !== 'ALL' || selectedSupplier !== 'ALL' || searchQuery !== '') && (
                  <button
                    onClick={() => {
                      setSelectedUrgency('ALL');
                      setSelectedSupplier('ALL');
                      setSearchQuery('');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline font-medium px-2 py-1 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            {/* Workflow Stage Buttons */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 mr-1">
                Workflow Stage:
              </span>

              {/* Pending Approval */}
              <button
                type="button"
                onClick={() => setSelectedStatus('Pending Approval')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedStatus === 'Pending Approval'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-200'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Pending Approval</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedStatus === 'Pending Approval'
                      ? 'bg-white text-amber-800'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  {pendingCount}
                </span>
              </button>

              {/* Approved for Payment */}
              <button
                type="button"
                onClick={() => setSelectedStatus('Approved')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedStatus === 'Approved'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-200'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Approved for Payment</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedStatus === 'Approved'
                      ? 'bg-white text-indigo-800'
                      : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                  }`}
                >
                  {approvedCount}
                </span>
              </button>

              {/* Processing */}
              <button
                type="button"
                onClick={() => setSelectedStatus('Processing')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedStatus === 'Processing'
                    ? 'bg-sky-600 text-white border-sky-700 shadow-xs ring-2 ring-sky-200'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <PlayCircle className="w-4 h-4 shrink-0" />
                <span>Processing</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedStatus === 'Processing'
                      ? 'bg-white text-sky-800'
                      : 'bg-sky-100 text-sky-900 border border-sky-200'
                  }`}
                >
                  {processingCount}
                </span>
              </button>

              {/* Paid */}
              <button
                type="button"
                onClick={() => setSelectedStatus('Paid')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedStatus === 'Paid'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Paid</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedStatus === 'Paid'
                      ? 'bg-white text-emerald-800'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  }`}
                >
                  {paidCount}
                </span>
              </button>
            </div>
          </div>

          {/* Main Combined Schedule & Workflow Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Ranked Payment Queue ({filteredInvoices.length} Invoices)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ranked strictly by: <span className="font-semibold text-slate-700">Overdue → Urgent → Upcoming → Not Due Yet → Needs Review</span>.
                </p>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Evaluation Date: <span className="font-bold text-slate-800">{formatDateDisplay(referenceDate)}</span>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-3">
                  <Search className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">No invoices match criteria</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No matched invoices match your current search or filter query.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 whitespace-nowrap w-32">Rank / Urgency</th>
                      <th className="py-3 px-4 min-w-[260px] w-72">Supplier &amp; PO</th>
                      <th className="py-3 px-4 whitespace-nowrap">Invoice #</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Invoice Total</th>
                      <th className="py-3 px-4 whitespace-nowrap">Due Date</th>
                      <th className="py-3 px-4 max-w-[180px]">Recommendation</th>
                      <th className="py-3 px-4 whitespace-nowrap w-32">Payment Status</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap w-28">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredInvoices.map((inv, idx) => {
                      const isOverdue = inv.urgencyTier === 'Overdue';
                      const isUrgent = inv.urgencyTier === 'Urgent';

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isOverdue
                              ? 'bg-red-50/20'
                              : isUrgent
                              ? 'bg-amber-50/20'
                              : inv.paymentStatus === 'Paid'
                              ? 'bg-emerald-50/10'
                              : ''
                          }`}
                        >
                          {/* Rank & Urgency Status */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-slate-400 font-bold text-xs w-5 text-right">
                                #{idx + 1}
                              </span>
                              <div>{getUrgencyBadge(inv.urgencyTier)}</div>
                            </div>
                          </td>

                          {/* Supplier & PO */}
                          <td className="py-3.5 px-4 min-w-[260px] max-w-[320px]">
                            <div className="font-bold text-slate-900 text-xs leading-snug">
                              {inv.supplierName}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1 flex items-center space-x-1 whitespace-nowrap">
                              <span className="text-slate-500 font-normal">PO Number:</span>
                              <span className="font-mono text-slate-800 font-semibold tracking-tight whitespace-nowrap">
                                {inv.poNumber}
                              </span>
                            </div>
                            {inv.paymentTerms && inv.paymentTerms.trim() !== '' && inv.paymentTerms !== 'None' && (
                              <div className="mt-1.5 pt-1 border-t border-slate-100">
                                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                                  Payment Terms:
                                </div>
                                <div
                                  className="group relative cursor-pointer"
                                  title={inv.paymentTerms}
                                >
                                  <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                                    {inv.paymentTerms}
                                  </p>
                                  <div className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-64 p-2.5 bg-slate-900/95 text-white text-[11px] rounded-lg shadow-xl leading-relaxed border border-slate-700">
                                    <div className="font-semibold text-slate-300 text-[10px] mb-0.5 uppercase tracking-wide">
                                      Full Payment Terms:
                                    </div>
                                    {inv.paymentTerms}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Invoice Number */}
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-900">
                            {inv.invoiceNumber}
                          </td>

                          {/* Total */}
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900 text-sm">
                            {formatCurrency(inv.invoiceTotal)}
                          </td>

                          {/* Due Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {inv.paymentDueDate ? (
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {formatDateDisplay(inv.paymentDueDate)}
                                </div>
                                <div
                                  className={`text-[11px] font-medium ${
                                    inv.daysDiff !== null && inv.daysDiff < 0
                                      ? 'text-red-700 font-bold'
                                      : inv.daysDiff !== null && inv.daysDiff <= 3
                                      ? 'text-amber-800 font-bold'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {inv.daysDiff !== null && inv.daysDiff < 0
                                    ? `${Math.abs(inv.daysDiff)} days overdue`
                                    : inv.daysDiff !== null && inv.daysDiff === 0
                                    ? 'Due today'
                                    : inv.daysDiff !== null
                                    ? `${inv.daysDiff} days remaining`
                                    : ''}
                                </div>
                              </div>
                            ) : (
                              <span className="text-purple-700 font-semibold text-xs">
                                Date Missing
                              </span>
                            )}
                          </td>

                          {/* Recommendation Reason */}
                          <td className="py-3.5 px-4 max-w-xs">
                            <div
                              className={`p-2 rounded-md text-xs leading-tight font-medium border ${
                                isOverdue
                                  ? 'bg-red-50 text-red-900 border-red-200'
                                  : isUrgent
                                  ? 'bg-amber-50 text-amber-950 border-amber-200'
                                  : inv.urgencyTier === 'Needs Review'
                                  ? 'bg-purple-50 text-purple-950 border-purple-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {inv.recommendationReason}
                            </div>
                          </td>

                          {/* Payment Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getStatusBadge(inv.paymentStatus)}
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {renderActionButton(inv)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Workflow Action / Details Modal */}
      {modalInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">
                  {modalInvoice.targetStatus === 'View' ? 'Payment Record' : 'Workflow Action'}
                </span>
                <h3 className="text-base font-bold text-white">{modalInvoice.actionTitle}</h3>
              </div>
              <button
                onClick={() => setModalInvoice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md text-sm font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmStatusChange} className="p-6 space-y-4">
              {/* Invoice Quick Summary Box */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      {modalInvoice.invoice.supplierName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Invoice: <span className="font-mono font-semibold text-blue-900">{modalInvoice.invoice.invoiceNumber}</span> • PO: <span className="font-mono">{modalInvoice.invoice.poNumber}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-slate-900">
                      {formatCurrency(modalInvoice.invoice.invoiceTotal)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Due: {formatDateDisplay(modalInvoice.invoice.paymentDueDate)}
                    </div>
                  </div>
                </div>

                {/* Status Indicator & Transition Flow */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    {modalInvoice.targetStatus === 'View' ? 'Current Status:' : 'Status Transition:'}
                  </span>
                  <div className="flex items-center space-x-2 font-bold">
                    <span className="px-2 py-0.5 rounded-xs bg-slate-200 text-slate-800 text-[11px]">
                      {modalInvoice.invoice.paymentStatus}
                    </span>
                    {modalInvoice.targetStatus !== 'View' && (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2 py-0.5 rounded-xs bg-blue-100 text-blue-900 border border-blue-300 text-[11px]">
                          {modalInvoice.targetStatus}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Schedule Recommendation Reason */}
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-xs border border-slate-200 mt-1">
                  <span className="font-semibold text-slate-700">Schedule Status:</span> {modalInvoice.invoice.recommendationReason}
                </div>

                {/* Historical Audit Metadata if recorded */}
                {(modalInvoice.invoice.approverName || modalInvoice.invoice.approvalDate || modalInvoice.invoice.paymentDate) && (
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
                    {modalInvoice.invoice.approverName && (
                      <div>Approver: <strong className="text-slate-800">{modalInvoice.invoice.approverName}</strong></div>
                    )}
                    {modalInvoice.invoice.approvalDate && (
                      <div>Approval Date: <strong className="text-slate-800">{formatDateTimeDisplay(modalInvoice.invoice.approvalDate)}</strong></div>
                    )}
                    {modalInvoice.invoice.processingDate && (
                      <div>Processing Date: <strong className="text-slate-800">{formatDateTimeDisplay(modalInvoice.invoice.processingDate)}</strong></div>
                    )}
                    {modalInvoice.invoice.paymentDate && (
                      <div>Payment Date: <strong className="text-slate-800">{formatDateTimeDisplay(modalInvoice.invoice.paymentDate)}</strong></div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Form Controls (only if not view-only) */}
              {modalInvoice.targetStatus !== 'View' ? (
                <>
                  {/* Approver Name Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Approver / Authorizer Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={approverInput}
                        onChange={(e) => setApproverInput(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                        placeholder="Enter approver name (e.g. Madam Lim)"
                      />
                    </div>
                  </div>

                  {/* Comments / Notes Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Comments / Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={commentsInput}
                      onChange={(e) => setCommentsInput(e.target.value)}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                      placeholder="Record mandatory comment for audit trail..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setModalInvoice(null)}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm &amp; Update Status</span>
                    </button>
                  </div>
                </>
              ) : (
                /* View Record Close Button */
                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setModalInvoice(null)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close Record
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
