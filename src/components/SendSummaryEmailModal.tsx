import React, { useState } from 'react';
import { Mail, X, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Invoice } from '../types';
import { formatCurrency, formatDateDisplay } from '../utils/calculations';

export interface EmailSummaryData {
  evaluationDate: string;
  totalUnpaidCount: number;
  totalUnpaidValue: number;
  overdueCount: number;
  overdueValue: number;
  urgentCount: number;
  urgentValue: number;
  upcomingCount: number;
  upcomingValue: number;
  notDueCount: number;
  notDueValue: number;
  invoices: Array<{
    supplierName: string;
    invoiceNumber: string;
    poNumber: string;
    invoiceTotal: number;
    paymentDueDate: string;
    daysRemaining: number;
    daysRemainingText: string;
    urgencyStatus: 'Overdue' | 'Urgent' | 'Upcoming' | 'Not Due Yet';
    recommendation: string;
  }>;
}

interface SendSummaryEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryData: EmailSummaryData | null;
  onSendSuccess?: () => void;
  onError?: (msg: string) => void;
}

export const SendSummaryEmailModal: React.FC<SendSummaryEmailModalProps> = ({
  isOpen,
  onClose,
  summaryData,
  onSendSuccess,
  onError,
}) => {
  if (!isOpen || !summaryData) return null;

  const defaultEmail =
    localStorage.getItem('madam_lim_email') || 'boonhuathardware@gmail.com';

  const isHasOverdue = summaryData.overdueCount > 0;
  const defaultSubject = isHasOverdue
    ? `Action Required: Overdue Invoice(s) – ${summaryData.evaluationDate}`
    : `Payment Schedule Summary – ${summaryData.evaluationDate}`;

  const [recipientEmail, setRecipientEmail] = useState<string>(defaultEmail);
  const [subject, setSubject] = useState<string>(defaultSubject);
  const [isSending, setIsSending] = useState<boolean>(false);

  const handleConfirmSend = () => {
    if (!recipientEmail || !recipientEmail.trim()) {
      alert('Please enter a valid recipient email address.');
      return;
    }

    setIsSending(true);

    try {
      // Remember confirmed recipient for future sends
      localStorage.setItem('madam_lim_email', recipientEmail.trim());

      // Construct plain text email body formatted for Gmail compose
      const bodyLines: string[] = [];
      bodyLines.push('Boon Huat Hardware & Supplies Pte Ltd');
      bodyLines.push('Payment Schedule Summary');
      bodyLines.push(`Evaluation Date: ${summaryData.evaluationDate}`);
      bodyLines.push('');

      if (summaryData.overdueCount > 0) {
        bodyLines.push('⚠ Overdue invoices require immediate attention.');
        bodyLines.push(`Number of overdue invoices: ${summaryData.overdueCount}`);
        bodyLines.push(`Total overdue payment amount: ${formatCurrency(summaryData.overdueValue)}`);
        bodyLines.push('');
      }

      bodyLines.push('==================================================');
      bodyLines.push('SHORT PAYMENT SUMMARY');
      bodyLines.push('==================================================');
      bodyLines.push(`Total Active Unpaid Invoices: ${summaryData.totalUnpaidCount}`);
      bodyLines.push(`Total Pending Payment Amount: ${formatCurrency(summaryData.totalUnpaidValue)}`);
      bodyLines.push('');
      bodyLines.push('URGENCY BREAKDOWN:');
      bodyLines.push(
        `• Overdue: ${summaryData.overdueCount} invoice(s) (${formatCurrency(summaryData.overdueValue)})`
      );
      bodyLines.push(
        `• Urgent: ${summaryData.urgentCount} invoice(s) (${formatCurrency(summaryData.urgentValue)})`
      );
      bodyLines.push(
        `• Upcoming: ${summaryData.upcomingCount} invoice(s) (${formatCurrency(summaryData.upcomingValue)})`
      );
      bodyLines.push(
        `• Not Due Yet: ${summaryData.notDueCount} invoice(s) (${formatCurrency(summaryData.notDueValue)})`
      );
      bodyLines.push('');
      bodyLines.push('==================================================');
      bodyLines.push('PRIORITISED INVOICE SCHEDULE');
      bodyLines.push('==================================================');
      bodyLines.push('');

      summaryData.invoices.forEach((inv, idx) => {
        bodyLines.push(`${idx + 1}. Supplier Name: ${inv.supplierName}`);
        bodyLines.push(`   Invoice Number: ${inv.invoiceNumber}`);
        bodyLines.push(`   PO Number: ${inv.poNumber}`);
        bodyLines.push(`   Invoice Total: ${formatCurrency(inv.invoiceTotal)}`);
        bodyLines.push(`   Due Date: ${inv.paymentDueDate ? formatDateDisplay(inv.paymentDueDate) : '-'}`);
        bodyLines.push(`   Days Remaining: ${inv.daysRemainingText}`);
        bodyLines.push(`   Urgency Status: ${inv.urgencyStatus}`);
        bodyLines.push(`   Recommendation: ${inv.recommendation}`);
        bodyLines.push('--------------------------------------------------');
      });

      bodyLines.push('');
      bodyLines.push('Please review the relevant invoices in the Payment Management System.');

      const emailBodyText = bodyLines.join('\n');

      // Construct Gmail web compose URL
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        recipientEmail.trim()
      )}&su=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(emailBodyText)}`;

      // Attempt to open Gmail in a new tab
      const win = window.open(gmailUrl, '_blank');

      if (!win) {
        // Fallback to mailto link if popup blocked
        const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail.trim())}?subject=${encodeURIComponent(
          subject.trim()
        )}&body=${encodeURIComponent(emailBodyText)}`;
        window.location.href = mailtoUrl;
      }

      if (onSendSuccess) onSendSuccess();
      onClose();
    } catch (err) {
      console.error('Error opening Gmail:', err);
      if (onError) {
        onError('Unable to open Gmail. Please check the Google account connection and try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Confirm & Send Email Summary</h3>
              <p className="text-[11px] text-slate-400">
                Send live Payment Schedule summary to Madam Lim
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Recipient & Subject Fields */}
          <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Recipient Email (Madam Lim):
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="madam.lim@boonhuathardware.com"
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Email Subject:
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Overdue Warning Alert Box if overdue invoices exist */}
          {isHasOverdue && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-900 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-extrabold text-red-800 text-sm flex items-center space-x-1.5">
                  <span>⚠ Overdue invoices require immediate attention.</span>
                </div>
                <div className="font-medium text-red-900">
                  Number of overdue invoices: <strong className="font-extrabold">{summaryData.overdueCount}</strong>
                </div>
                <div className="font-medium text-red-900">
                  Total overdue payment amount: <strong className="font-extrabold">{formatCurrency(summaryData.overdueValue)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics Breakdown */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>Payment Summary Breakdown</span>
              <span className="text-slate-500 font-normal">
                Eval Date: {summaryData.evaluationDate}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-red-50/80 border border-red-200 p-2.5 rounded-lg">
                <div className="text-[10px] font-bold text-red-700 uppercase">Overdue</div>
                <div className="font-bold text-red-900 text-sm mt-0.5">
                  {formatCurrency(summaryData.overdueValue)}
                </div>
                <div className="text-[11px] text-red-600 font-medium">
                  {summaryData.overdueCount} invoice(s)
                </div>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-lg">
                <div className="text-[10px] font-bold text-amber-700 uppercase">Urgent</div>
                <div className="font-bold text-amber-900 text-sm mt-0.5">
                  {formatCurrency(summaryData.urgentValue)}
                </div>
                <div className="text-[11px] text-amber-600 font-medium">
                  {summaryData.urgentCount} invoice(s)
                </div>
              </div>

              <div className="bg-blue-50/80 border border-blue-200 p-2.5 rounded-lg">
                <div className="text-[10px] font-bold text-blue-700 uppercase">Upcoming</div>
                <div className="font-bold text-blue-900 text-sm mt-0.5">
                  {formatCurrency(summaryData.upcomingValue)}
                </div>
                <div className="text-[11px] text-blue-600 font-medium">
                  {summaryData.upcomingCount} invoice(s)
                </div>
              </div>

              <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-lg">
                <div className="text-[10px] font-bold text-slate-700 uppercase">Not Due Yet</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {formatCurrency(summaryData.notDueValue)}
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  {summaryData.notDueCount} invoice(s)
                </div>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Prioritised Invoice Table ({summaryData.invoices.length} active unpaid)
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Supplier Name</th>
                    <th className="py-2 px-3">Invoice #</th>
                    <th className="py-2 px-3">PO #</th>
                    <th className="py-2 px-3 text-right">Invoice Total</th>
                    <th className="py-2 px-3">Due Date</th>
                    <th className="py-2 px-3">Days Rem.</th>
                    <th className="py-2 px-3">Urgency Status</th>
                    <th className="py-2 px-3">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {summaryData.invoices.map((inv, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-900">{inv.supplierName}</td>
                      <td className="py-2 px-3 font-mono">{inv.invoiceNumber}</td>
                      <td className="py-2 px-3 font-mono">{inv.poNumber}</td>
                      <td className="py-2 px-3 font-bold text-right">{formatCurrency(inv.invoiceTotal)}</td>
                      <td className="py-2 px-3">{inv.paymentDueDate ? formatDateDisplay(inv.paymentDueDate) : '-'}</td>
                      <td className="py-2 px-3">{inv.daysRemainingText}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            inv.urgencyStatus === 'Overdue'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : inv.urgencyStatus === 'Urgent'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : inv.urgencyStatus === 'Upcoming'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {inv.urgencyStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] font-medium text-slate-600">{inv.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 border border-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmSend}
            disabled={isSending}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Email via Gmail</span>
          </button>
        </div>
      </div>
    </div>
  );
};
