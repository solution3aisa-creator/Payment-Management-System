export type MatchingStatus = 'Matched' | 'Unmatched' | 'Discrepancy';

export type PaymentStatus = 'Pending Approval' | 'Approved' | 'Processing' | 'Paid' | 'Rejected';

export type UrgencyTier = 'Overdue' | 'Urgent' | 'Upcoming' | 'Not Due Yet' | 'Needs Review';

export interface Invoice {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  poNumber: string;
  invoiceTotal: number;
  paymentDueDate: string | null; // YYYY-MM-DD
  paymentTerms: string | null; // e.g. "Net 30", "Net 14", "Due on Receipt", etc.
  itemDescription?: string | null; // e.g. "Line item description"
  matchingStatus: MatchingStatus;
  urgencyTier: UrgencyTier;
  paymentStatus: PaymentStatus;
  recommendationReason: string;
  approverName: string | null;
  approvalDate: string | null; // ISO string or formatted date
  processingDate: string | null; // ISO string or formatted date
  paymentDate: string | null; // ISO string or formatted date
  comments: string | null;
  // Computed property for days relative to reference date
  daysDiff?: number | null;
}

export interface AuditRecord {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  previousStatus: PaymentStatus | 'None';
  newStatus: PaymentStatus;
  action: string;
  user: string;
  dateTime: string;
  comments: string;
}

export interface ScheduleSummary {
  overdueCount: number;
  overdueTotal: number;
  urgentCount: number;
  urgentTotal: number;
  upcomingCount: number;
  upcomingTotal: number;
  notDueYetCount: number;
  notDueYetTotal: number;
  needsReviewCount: number;
  needsReviewTotal: number;
  pendingTotalValue: number;
}
