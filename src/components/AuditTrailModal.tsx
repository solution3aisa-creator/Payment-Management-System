import React, { useState } from 'react';
import { AuditRecord } from '../types';
import { formatDateTimeDisplay } from '../utils/calculations';
import { History, Search, ShieldCheck, ArrowRight, User, Calendar, MessageSquare, X } from 'lucide-react';

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditLogs: AuditRecord[];
  filterInvoiceNumber?: string | null;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  isOpen,
  onClose,
  auditLogs,
  filterInvoiceNumber,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [invoiceFilter, setInvoiceFilter] = useState<string>(filterInvoiceNumber || 'ALL');

  if (!isOpen) return null;

  // Filter logs
  const invoiceNumbers = Array.from(new Set(auditLogs.map((a) => a.invoiceNumber))).sort();

  const filteredLogs = auditLogs
    .filter((log) => {
      const matchesInvoice = invoiceFilter === 'ALL' || log.invoiceNumber === invoiceFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        log.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.comments.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesInvoice && matchesSearch;
    })
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-900 text-blue-200 rounded-lg">
              <History className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-blue-300">
                System Audit Log • Append-Only Ledger
              </div>
              <h3 className="text-base font-bold text-white">Full Accounts Payable Audit Trail</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md text-sm font-bold transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail by Invoice #, Supplier, User, Action, or Comments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 text-slate-900 outline-hidden bg-white"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0">
            <label htmlFor="audit-invoice-filter" className="text-xs font-bold text-slate-600">Filter Invoice:</label>
            <select
              id="audit-invoice-filter"
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Invoices ({auditLogs.length} events)</option>
              {invoiceNumbers.map((inv) => (
                <option key={inv} value={inv}>{inv}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Logs List */}
        <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-200 space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No audit log records match your filter criteria.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="pt-4 first:pt-0 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-xs">
                      {log.invoiceNumber}
                    </span>
                    <span className="font-bold text-slate-900">{log.supplierName}</span>
                  </div>

                  <div className="text-slate-500 flex items-center space-x-1 font-mono text-[11px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDateTimeDisplay(log.dateTime)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                    Action: <strong className="text-slate-900">{log.action}</strong>
                  </span>

                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                    <span className="text-slate-500 font-medium text-[11px]">Transition:</span>
                    <span className="font-semibold text-slate-700">{log.previousStatus}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="font-bold text-blue-900">{log.newStatus}</span>
                  </div>

                  <div className="flex items-center space-x-1 text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
                    <User className="w-3 h-3 text-slate-500" />
                    <span className="font-medium text-[11px]">{log.user}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-start space-x-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-700">Audit Comment:</span> "{log.comments}"
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <strong className="text-slate-800">{filteredLogs.length}</strong> audit records
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors"
          >
            Close Audit Trail
          </button>
        </div>
      </div>
    </div>
  );
};
