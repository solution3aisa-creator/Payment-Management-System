import { Invoice, AuditRecord } from '../types';
import { evaluateInvoices, sortInvoicesForSchedule } from '../utils/calculations';

export const DEFAULT_REFERENCE_DATE = new Date().toISOString().split('T')[0];

export const INITIAL_INVOICES_RAW: Omit<Invoice, 'urgencyTier' | 'recommendationReason' | 'daysDiff'>[] = [];

export const INITIAL_AUDIT_LOGS: AuditRecord[] = [];

export function getInitialInvoices(referenceDateInput?: string | Date): Invoice[] {
  const evaluated = evaluateInvoices(INITIAL_INVOICES_RAW as Invoice[], referenceDateInput || new Date());
  return sortInvoicesForSchedule(evaluated);
}
