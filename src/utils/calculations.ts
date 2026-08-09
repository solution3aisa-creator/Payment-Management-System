import { Invoice, PaymentStatus, UrgencyTier, ScheduleSummary } from '../types';

/**
 * Calculates due date based on invoice date and payment terms if paymentDueDate is missing.
 */
export function calculateDueDate(invoiceDateStr: string, paymentTerms: string | null): string | null {
  if (!invoiceDateStr) return null;

  if (!paymentTerms || paymentTerms.trim() === '') {
    return null;
  }

  const normalizedTerms = paymentTerms.trim().toLowerCase();
  const invoiceDate = new Date(invoiceDateStr);
  if (isNaN(invoiceDate.getTime())) return null;

  if (normalizedTerms === 'due on receipt' || normalizedTerms === 'cash on delivery' || normalizedTerms === 'cod') {
    return invoiceDateStr;
  }

  const netMatch = normalizedTerms.match(/net\s*(\d+)/i);
  if (netMatch) {
    const days = parseInt(netMatch[1], 10);
    if (!isNaN(days)) {
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + days);
      return dueDate.toISOString().split('T')[0];
    }
  }

  return null;
}

/**
 * Calculates Days Remaining relative to today's date (or optional reference input).
 * Rules:
 * - Uses calendar dates only. Hours, minutes, and seconds are ignored.
 * - Days Remaining = Due Date − Today's Date
 * - Due today: 0 days
 * - Future due date: positive whole number of days
 * - Past due date: negative whole number of days (e.g. -1 day, -5 days)
 * - No decimal values or rounding used.
 */
export function calculateDaysDifference(
  dueDateStr: string | null,
  referenceDateInput?: string | Date
): number | null {
  if (!dueDateStr) return null;

  const cleanDueStr = dueDateStr.includes('T') ? dueDateStr.split('T')[0] : dueDateStr.trim();
  const parts = cleanDueStr.split('-');
  if (parts.length !== 3) return null;

  const dueYear = parseInt(parts[0], 10);
  const dueMonth = parseInt(parts[1], 10) - 1;
  const dueDay = parseInt(parts[2], 10);

  if (isNaN(dueYear) || isNaN(dueMonth) || isNaN(dueDay)) return null;

  // Determine Today's Date components (year, month, day)
  let refDate: Date;
  if (referenceDateInput instanceof Date) {
    refDate = referenceDateInput;
  } else if (typeof referenceDateInput === 'string' && referenceDateInput.trim()) {
    const cleanRefStr = referenceDateInput.includes('T') ? referenceDateInput.split('T')[0] : referenceDateInput.trim();
    const refParts = cleanRefStr.split('-');
    if (refParts.length === 3) {
      const y = parseInt(refParts[0], 10);
      const m = parseInt(refParts[1], 10) - 1;
      const d = parseInt(refParts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        refDate = new Date(y, m, d);
      } else {
        refDate = new Date();
      }
    } else {
      refDate = new Date();
    }
  } else {
    refDate = new Date();
  }

  if (isNaN(refDate.getTime())) refDate = new Date();

  // Calendar dates at UTC 00:00:00 to completely ignore hours, minutes, seconds and DST shifts
  const dueUtc = Date.UTC(dueYear, dueMonth, dueDay);
  const todayUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  // Days Remaining = Due Date - Today's Date
  const diffMs = dueUtc - todayUtc;
  const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return daysDiff;
}

/**
 * Formats days remaining as a plain-English string:
 * - 0 days
 * - 1 day, 5 days
 * - -1 day, -5 days
 */
export function formatDaysRemainingText(daysDiff: number | null | undefined): string {
  if (daysDiff === null || daysDiff === undefined) return '';
  const abs = Math.abs(daysDiff);
  const unit = abs === 1 ? 'day' : 'days';
  return `${daysDiff} ${unit}`;
}

/**
 * Determines Urgency Status and exact plain-English Recommendation Reason based on due date and reference date.
 */
export function determineUrgencyAndReason(
  paymentDueDate: string | null,
  invoiceDateStr: string,
  paymentTerms: string | null,
  referenceDateInput?: string | Date
): { urgencyTier: UrgencyTier; recommendationReason: string; computedDueDate: string | null; daysDiff: number | null } {
  // Determine effective due date
  let effectiveDueDate = paymentDueDate;
  if (!effectiveDueDate) {
    effectiveDueDate = calculateDueDate(invoiceDateStr, paymentTerms);
  }

  if (!effectiveDueDate) {
    return {
      urgencyTier: 'Needs Review',
      recommendationReason: 'Due date cannot be determined because payment terms are missing.',
      computedDueDate: null,
      daysDiff: null,
    };
  }

  const daysDiff = calculateDaysDifference(effectiveDueDate, referenceDateInput);

  if (daysDiff === null) {
    return {
      urgencyTier: 'Needs Review',
      recommendationReason: 'Due date format is invalid.',
      computedDueDate: effectiveDueDate,
      daysDiff: null,
    };
  }

  let urgencyTier: UrgencyTier;
  let recommendationReason: string;

  if (daysDiff < 0) {
    urgencyTier = 'Overdue';
    recommendationReason = 'Approve & Pay Immediately';
  } else if (daysDiff <= 3) {
    urgencyTier = 'Urgent';
    recommendationReason = 'Approve for Payment';
  } else if (daysDiff <= 14) {
    urgencyTier = 'Upcoming';
    recommendationReason = 'Review & Schedule Payment';
  } else {
    urgencyTier = 'Not Due Yet';
    recommendationReason = 'Monitor and Schedule Later';
  }

  return {
    urgencyTier,
    recommendationReason,
    computedDueDate: effectiveDueDate,
    daysDiff,
  };
}

/**
 * Validates Solution 3 payment status based on timestamp presence:
 * - Approved requires an Approval Date
 * - Processing requires both Approval Date and Processing Date
 * - Paid requires Approval Date, Processing Date, and Payment Date
 * If required timestamps are missing, defaults paymentStatus to 'Pending Approval'.
 */
export function validateInvoicePaymentStatus(inv: Invoice): Invoice {
  let status: PaymentStatus = inv.paymentStatus || 'Pending Approval';
  const approvalDate = inv.approvalDate && String(inv.approvalDate).trim() ? String(inv.approvalDate).trim() : null;
  const processingDate = inv.processingDate && String(inv.processingDate).trim() ? String(inv.processingDate).trim() : null;
  const paymentDate = inv.paymentDate && String(inv.paymentDate).trim() ? String(inv.paymentDate).trim() : null;
  let approverName = inv.approverName && String(inv.approverName).trim() ? String(inv.approverName).trim() : null;

  if (status === 'Approved') {
    if (!approvalDate) {
      status = 'Pending Approval';
    }
  } else if (status === 'Processing') {
    if (!approvalDate || !processingDate) {
      status = 'Pending Approval';
    }
  } else if (status === 'Paid') {
    if (!approvalDate || !processingDate || !paymentDate) {
      status = 'Pending Approval';
    }
  } else {
    status = 'Pending Approval';
  }

  if (status === 'Pending Approval') {
    return {
      ...inv,
      paymentStatus: 'Pending Approval',
      approverName: null,
      approvalDate: null,
      processingDate: null,
      paymentDate: null,
    };
  }

  return {
    ...inv,
    paymentStatus: status,
    approverName: approverName || 'Madam Lim',
    approvalDate,
    processingDate,
    paymentDate,
  };
}

/**
 * Re-evaluates all invoices dynamically relative to real current system date/time or optional reference input.
 */
export function evaluateInvoices(invoices: Invoice[], referenceDateInput?: string | Date): Invoice[] {
  const refDate = referenceDateInput || new Date();
  return invoices.map((inv) => {
    const validatedInv = validateInvoicePaymentStatus(inv);
    const { urgencyTier, recommendationReason, computedDueDate, daysDiff } = determineUrgencyAndReason(
      validatedInv.paymentDueDate,
      validatedInv.invoiceDate,
      validatedInv.paymentTerms,
      refDate
    );

    return {
      ...validatedInv,
      paymentDueDate: computedDueDate,
      urgencyTier,
      recommendationReason,
      daysDiff,
    };
  });
}

const tierPriority: Record<UrgencyTier, number> = {
  'Overdue': 1,
  'Urgent': 2,
  'Upcoming': 3,
  'Not Due Yet': 4,
  'Needs Review': 5,
};

/**
 * Ranks invoices strictly by:
 * 1. Overdue
 * 2. Urgent
 * 3. Upcoming
 * 4. Not Due Yet
 * 5. Needs Review
 * Within each category, earliest due date first.
 */
export function sortInvoicesForSchedule(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort((a, b) => {
    const priorityA = tierPriority[a.urgencyTier];
    const priorityB = tierPriority[b.urgencyTier];

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Secondary sort: Earliest due date first
    if (a.paymentDueDate && b.paymentDueDate) {
      return new Date(a.paymentDueDate).getTime() - new Date(b.paymentDueDate).getTime();
    }
    if (a.paymentDueDate) return -1;
    if (b.paymentDueDate) return 1;

    // Fallback sort by invoice number
    return a.invoiceNumber.localeCompare(b.invoiceNumber);
  });
}

/**
 * Calculates schedule summary metrics for Matched & unpaid invoices.
 */
export function computeScheduleSummary(invoices: Invoice[]): ScheduleSummary {
  const activeInvoices = invoices.filter(
    (inv) => inv.matchingStatus === 'Matched' && inv.paymentStatus !== 'Paid'
  );

  const summary: ScheduleSummary = {
    overdueCount: 0,
    overdueTotal: 0,
    urgentCount: 0,
    urgentTotal: 0,
    upcomingCount: 0,
    upcomingTotal: 0,
    notDueYetCount: 0,
    notDueYetTotal: 0,
    needsReviewCount: 0,
    needsReviewTotal: 0,
    pendingTotalValue: 0,
  };

  activeInvoices.forEach((inv) => {
    summary.pendingTotalValue += inv.invoiceTotal;

    switch (inv.urgencyTier) {
      case 'Overdue':
        summary.overdueCount += 1;
        summary.overdueTotal += inv.invoiceTotal;
        break;
      case 'Urgent':
        summary.urgentCount += 1;
        summary.urgentTotal += inv.invoiceTotal;
        break;
      case 'Upcoming':
        summary.upcomingCount += 1;
        summary.upcomingTotal += inv.invoiceTotal;
        break;
      case 'Not Due Yet':
        summary.notDueYetCount += 1;
        summary.notDueYetTotal += inv.invoiceTotal;
        break;
      case 'Needs Review':
        summary.needsReviewCount += 1;
        summary.needsReviewTotal += inv.invoiceTotal;
        break;
    }
  });

  return summary;
}

/**
 * Formats a numeric value to SGD currency. e.g. S$1,250.00
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace('SGD', 'S$');
}

/**
 * Formats YYYY-MM-DD or ISO string to display format like "28 Jul 2026".
 */
export function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const d = new Date(cleanDate + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;

  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats ISO date time string to readable "28 Jul 2026, 02:45 PM".
 */
export function formatDateTimeDisplay(dateTimeStr: string | null): string {
  if (!dateTimeStr) return 'N/A';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;

  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}
