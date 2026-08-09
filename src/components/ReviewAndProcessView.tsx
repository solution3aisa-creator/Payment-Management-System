import React, { useState, useRef, useEffect } from 'react';
import { Invoice, UrgencyTier, PaymentStatus } from '../types';
import { formatCurrency, formatDateDisplay, formatDateTimeDisplay, sortInvoicesForSchedule } from '../utils/calculations';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  Search,
  HelpCircle,
  UploadCloud,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  PlayCircle,
  UserCheck,
  MessageSquare,
  X,
  XCircle,
  Filter,
} from 'lucide-react';

interface ReviewAndProcessViewProps {
  invoices: Invoice[];
  onUpdateInvoiceStatus: (
    invoiceId: string,
    newStatus: PaymentStatus,
    approverName: string,
    comments: string
  ) => void;
  referenceDate: string;
  onNavigateToImport: () => void;
  selectedInvoiceId?: string | null;
}

export const ReviewAndProcessView: React.FC<ReviewAndProcessViewProps> = ({
  invoices,
  onUpdateInvoiceStatus,
  referenceDate,
  onNavigateToImport,
  selectedInvoiceId,
}) => {
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('Pending Approval');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Workflow Modal state
  const [modalInvoice, setModalInvoice] = useState<{
    invoice: Invoice;
    targetStatus: PaymentStatus | 'View';
    actionTitle: string;
  } | null>(null);

  const [approverInput, setApproverInput] = useState<string>('Madam Lim');
  const [commentsInput, setCommentsInput] = useState<string>('');

  const isDatabaseUploaded = invoices.length > 0;

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

  // Filter matched invoices across all payment stages
  const matchedInvoices = invoices.filter((inv) => inv.matchingStatus === 'Matched');

  // Status stage counts
  const pendingCount = matchedInvoices.filter((i) => i.paymentStatus === 'Pending Approval').length;
  const approvedCount = matchedInvoices.filter((i) => i.paymentStatus === 'Approved').length;
  const processingCount = matchedInvoices.filter((i) => i.paymentStatus === 'Processing').length;
  const paidCount = matchedInvoices.filter((i) => i.paymentStatus === 'Paid').length;

  // Unique suppliers for filter
  const suppliers = Array.from(new Set(matchedInvoices.map((inv) => inv.supplierName))).sort();

  // Filter logic
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
          <span className="inline-flex items-center space-x-1 bg-red-100 text-red-800 text-xs font-extrabold px-2.5 py-1 rounded-full border border-red-300 shadow-2xs">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>OVERDUE</span>
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
      case 'Rejected':
        return (
          <span className="bg-red-50 text-red-900 text-xs font-bold px-2.5 py-1 rounded-md border border-red-200 inline-flex items-center space-x-1">
            <XCircle className="w-3 h-3 text-red-700" />
            <span>Rejected</span>
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
            className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Review &amp; Approve</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Approved':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Mark as Processing</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Processing':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <span>Mark as Paid</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        );
      case 'Paid':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>View Record</span>
          </button>
        );
      case 'Rejected':
        return (
          <button
            onClick={() => handleOpenActionModal(inv)}
            className="inline-flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>View Record</span>
          </button>
        );
      default:
        return null;
    }
  };

  if (!isDatabaseUploaded) {
    return (
      <div className="bg-white rounded-xl p-10 border border-slate-200 shadow-2xs text-center space-y-6">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
          <FileSpreadsheet className="w-8 h-8" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <h2 className="text-lg font-bold text-slate-900">
            No matched invoice database has been uploaded.
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Please import a Matched Invoice Database in Step 1 (Import Matched Invoices) to begin reviewing and processing payments.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <button
            onClick={onNavigateToImport}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Go to Import Matched Invoices</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls & Workflow Stage Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
        {/* Search & Urgency / Supplier Filters */}
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
                <option value="Overdue">Overdue</option>
                <option value="Urgent">Urgent (0-3d)</option>
                <option value="Upcoming">Upcoming (4-14d)</option>
                <option value="Not Due Yet">Not Due Yet (&gt;14d)</option>
                <option value="Needs Review">Needs Review</option>
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

          {/* Pending Approval Button */}
          <button
            type="button"
            onClick={() => setSelectedStatus('Pending Approval')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
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

          {/* Approved for Payment Button */}
          <button
            type="button"
            onClick={() => setSelectedStatus('Approved')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
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

          {/* Processing Button */}
          <button
            type="button"
            onClick={() => setSelectedStatus('Processing')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
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

          {/* Paid Button */}
          <button
            type="button"
            onClick={() => setSelectedStatus('Paid')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
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

      {/* Invoice Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Invoices in Stage: <span className="text-blue-700 font-extrabold">{selectedStatus}</span> ({filteredInvoices.length} Invoices)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked strictly by: <span className="font-semibold text-slate-700">Overdue → Urgent → Upcoming → Not Due Yet → Needs Review</span>
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
              No matched invoices found for status "{selectedStatus}" matching your search/filter parameters.
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
                {sortInvoicesForSchedule(filteredInvoices).map((inv, idx) => {
                  const isOverdue = inv.urgencyTier === 'Overdue';
                  const isUrgent = inv.urgencyTier === 'Urgent';
                  const overdueDays = inv.daysDiff !== null && inv.daysDiff < 0 ? Math.abs(inv.daysDiff) : 0;

                  return (
                    <tr
                      key={`${inv.id}-${idx}`}
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
                              {inv.daysDiff !== null
                                ? `${inv.daysDiff} ${Math.abs(inv.daysDiff) === 1 ? 'day' : 'days'}`
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
                      <td className="py-3.5 px-4 max-w-xs space-y-1">
                        <div
                          className={`p-2 rounded-md text-xs leading-tight font-bold border ${
                            isOverdue
                              ? 'bg-red-100 text-red-950 border-red-300'
                              : isUrgent
                              ? 'bg-amber-50 text-amber-950 border-amber-200'
                              : inv.urgencyTier === 'Needs Review'
                              ? 'bg-purple-50 text-purple-950 border-purple-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {inv.recommendationReason}
                        </div>
                        {isOverdue && overdueDays > 0 && (
                          <div className="text-[11px] font-semibold text-red-700 bg-red-50 p-1.5 rounded-md border border-red-200 flex items-start space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                            <span>
                              Payment is overdue by {overdueDays} {overdueDays === 1 ? 'day' : 'days'}. Immediate review recommended.
                            </span>
                          </div>
                        )}
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

      {/* Action / Review Modal */}
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

                {/* Status Transition Flow */}
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

                {/* Recommendation Reason */}
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-xs border border-slate-200 mt-1">
                  <span className="font-semibold text-slate-700">Schedule Status:</span> {modalInvoice.invoice.recommendationReason}
                </div>

                {/* Overdue Warning Message */}
                {modalInvoice.invoice.urgencyTier === 'Overdue' && modalInvoice.invoice.daysDiff !== null && modalInvoice.invoice.daysDiff < 0 && (
                  <div className="bg-red-50 border border-red-200 p-2.5 rounded-md flex items-center space-x-2 text-xs font-semibold text-red-900 mt-1">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      Payment is overdue by {Math.abs(modalInvoice.invoice.daysDiff)} {Math.abs(modalInvoice.invoice.daysDiff) === 1 ? 'day' : 'days'}. Immediate review recommended.
                    </span>
                  </div>
                )}

                {/* Historical Audit Metadata */}
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
                        placeholder="e.g. Madam Lim"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Approval Comments / Audit Notes
                    </label>
                    <div className="relative">
                      <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <textarea
                        rows={3}
                        value={commentsInput}
                        onChange={(e) => setCommentsInput(e.target.value)}
                        placeholder="Add notes for audit trail..."
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setModalInvoice(null)}
                      className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    {modalInvoice.invoice.paymentStatus === 'Pending Approval' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!modalInvoice) return;
                          onUpdateInvoiceStatus(
                            modalInvoice.invoice.id,
                            'Rejected',
                            approverInput.trim() || 'Madam Lim',
                            commentsInput.trim() || 'Rejected due to unresolved invoice discrepancy.'
                          );
                          setModalInvoice(null);
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        Reject Payment
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      Confirm {modalInvoice.targetStatus}
                    </button>
                  </div>
                </>
              ) : (
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
