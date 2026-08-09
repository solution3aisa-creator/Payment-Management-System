import * as XLSX from 'xlsx';
import { Invoice } from '../types';
import { validateInvoicePaymentStatus } from './calculations';

export function parseMatchedInvoicesFile(buffer: ArrayBuffer): { invoices: Invoice[]; rowCount: number; matchedCount: number } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { invoices: [], rowCount: 0, matchedCount: 0 };
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const invoices: Invoice[] = [];
  let matchedCount = 0;

  rawRows.forEach((row, idx) => {
    // Flexibly match column headers
    const getVal = (...keys: string[]) => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.trim().toLowerCase() === k.trim().toLowerCase()) {
            return row[rowKey];
          }
        }
      }
      return null;
    };

    const supplierName =
      getVal('Supplier Name', 'SupplierName', 'Supplier', 'Vendor Name', 'Vendor') || '';
    const invoiceNumber =
      getVal('Invoice Number', 'InvoiceNumber', 'Invoice #', 'InvoiceNo', 'Invoice ID', 'Invoice') || '';

    // Skip empty rows
    if (!supplierName && !invoiceNumber) return;

    let rawInvoiceDate = getVal('Invoice Date', 'InvoiceDate', 'Date') || new Date().toISOString().split('T')[0];
    let invoiceDate = String(rawInvoiceDate).trim();
    if (typeof rawInvoiceDate === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const parsedDate = new Date(excelEpoch.getTime() + rawInvoiceDate * 86400000);
      invoiceDate = parsedDate.toISOString().split('T')[0];
    }

    const poNumber = getVal('PO Number', 'PONumber', 'PO #', 'PO') || '';
    const itemDesc = getVal('Item Description', 'ItemDescription', 'Description', 'Item', 'Line Item', 'Particulars') || '';

    let rawTotal = getVal('Invoice Total', 'InvoiceTotal', 'Total Amount', 'Amount', 'Total', 'Invoice Amount', 'SGD Total') || 0;
    if (typeof rawTotal === 'string') {
      rawTotal = parseFloat(rawTotal.replace(/[^0-9.-]+/g, '')) || 0;
    }

    let rawDueDate = getVal('Payment Due Date', 'PaymentDueDate', 'Due Date', 'DueDate') || null;
    let paymentDueDate: string | null = null;
    if (typeof rawDueDate === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const parsedDate = new Date(excelEpoch.getTime() + rawDueDate * 86400000);
      paymentDueDate = parsedDate.toISOString().split('T')[0];
    } else if (rawDueDate) {
      paymentDueDate = String(rawDueDate).trim() || null;
    }

    const paymentTerms = getVal('Payment Terms', 'PaymentTerms', 'Terms', 'Terms Code') || null;

    let rawMatchingStatus = getVal('Matching Status', 'MatchingStatus', 'Status', 'Match Status') || 'Matched';
    let matchingStatus: 'Matched' | 'Mismatched' | 'Pending' = 'Matched';
    const strMatch = String(rawMatchingStatus).toLowerCase();
    if (strMatch.includes('mismatch')) {
      matchingStatus = 'Mismatched';
    } else if (strMatch.includes('pending')) {
      matchingStatus = 'Pending';
    }

    // Solution 3 requirement: Retrieve only invoices with Matching Status = Matched
    if (matchingStatus !== 'Matched') {
      return;
    }

    matchedCount++;

    let rawPaymentStatus = getVal('Payment Status', 'PaymentStatus') || 'Pending Approval';
    let paymentStatus: any = 'Pending Approval';
    const strPayment = String(rawPaymentStatus).toLowerCase();
    if (strPayment.includes('paid')) {
      paymentStatus = 'Paid';
    } else if (strPayment.includes('processing')) {
      paymentStatus = 'Processing';
    } else if (strPayment.includes('approved')) {
      paymentStatus = 'Approved';
    }

    const parseOptDate = (raw: any): string | null => {
      if (!raw) return null;
      if (typeof raw === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsedDate = new Date(excelEpoch.getTime() + raw * 86400000);
        return parsedDate.toISOString().split('T')[0];
      }
      return String(raw).trim() || null;
    };

    const approverName = getVal('Approver Name', 'Approver') || null;
    const approvalDate = parseOptDate(getVal('Approval Date', 'ApprovalDate'));
    const processingDate = parseOptDate(getVal('Processing Date', 'ProcessingDate'));
    const paymentDate = parseOptDate(getVal('Payment Date', 'PaymentDate'));
    const comments = getVal('Comments', 'Reason', 'Remarks', 'Notes') || '';

    const rawInvoice: Invoice = {
      id: `inv-${String(invoiceNumber).trim() || idx}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      supplierName: String(supplierName).trim() || 'Supplier',
      invoiceNumber: String(invoiceNumber).trim() || `INV-${idx + 1}`,
      invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
      poNumber: String(poNumber).trim(),
      itemDescription: itemDesc ? String(itemDesc).trim() : '',
      invoiceTotal: Number(rawTotal) || 0,
      paymentDueDate,
      paymentTerms: paymentTerms ? String(paymentTerms).trim() : null,
      matchingStatus: 'Matched',
      urgencyTier: 'Needs Review',
      recommendationReason: '',
      paymentStatus,
      approverName: approverName ? String(approverName).trim() : null,
      approvalDate,
      processingDate,
      paymentDate,
      comments: comments ? String(comments).trim() : '',
    };

    invoices.push(validateInvoicePaymentStatus(rawInvoice));
  });

  return {
    invoices,
    rowCount: rawRows.length,
    matchedCount: invoices.length,
  };
}
