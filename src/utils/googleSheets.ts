import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Invoice, PaymentStatus } from '../types';
import { formatDateDisplay, validateInvoicePaymentStatus } from './calculations';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;
let connectedSheetUrl: string | null = localStorage.getItem('s3_connected_sheet_url') || null;

export const setConnectedSheetUrl = (url: string | null) => {
  connectedSheetUrl = url;
  if (url) {
    localStorage.setItem('s3_connected_sheet_url', url);
  } else {
    localStorage.removeItem('s3_connected_sheet_url');
  }
};

export const getConnectedSheetUrl = () => {
  return connectedSheetUrl || localStorage.getItem('s3_connected_sheet_url');
};

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    const token = getCachedAccessToken();
    if (user && token) {
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        localStorage.removeItem('s3_access_token');
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Sign-In.');
    }
    cachedAccessToken = credential.accessToken;
    localStorage.setItem('s3_access_token', credential.accessToken);
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {
      console.info('Google Sign-In popup was closed by user.');
    } else if (error?.code === 'auth/cancelled-popup-request' || error?.message?.includes('cancelled-popup-request')) {
      console.info('Google Sign-In popup request was cancelled.');
    } else {
      console.error('Google Sign-In Error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const signOutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem('s3_access_token');
  currentUser = null;
};

export const getCachedAccessToken = () => {
  if (!cachedAccessToken) {
    cachedAccessToken = localStorage.getItem('s3_access_token');
  }
  return cachedAccessToken;
};
export const getCurrentUser = () => currentUser;

export interface GoogleDriveSheet {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface ConnectedSheetMetadata {
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  worksheets: string[];
  lastSyncedAt: string;
}

const STORAGE_KEY_SHEET_META = 's3_connected_sheet_meta';

export const saveConnectedSheetMeta = (meta: ConnectedSheetMetadata | null) => {
  if (meta) {
    localStorage.setItem(STORAGE_KEY_SHEET_META, JSON.stringify(meta));
    setConnectedSheetUrl(meta.spreadsheetUrl);
  } else {
    localStorage.removeItem(STORAGE_KEY_SHEET_META);
    setConnectedSheetUrl(null);
  }
};

export const getConnectedSheetMeta = (): ConnectedSheetMetadata | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEET_META);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const SHARED_SPREADSHEET_NAME = 'Boon Huat AP Database';

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError || new Error('Fetch failed after retries');
}

export async function findBoonHuatDatabaseId(token: string): Promise<GoogleDriveSheet | null> {
  try {
    const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const response = await fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&pageSize=50&orderBy=modifiedTime desc`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      if (
        response.status === 401 ||
        response.status === 403 ||
        errText.includes('PERMISSION_DENIED') ||
        errText.includes('UNAUTHENTICATED')
      ) {
        cachedAccessToken = null;
        localStorage.removeItem('s3_access_token');
      }
      return null;
    }

    const data = await response.json();
    const files: GoogleDriveSheet[] = data.files || [];

    const exactMatch = files.find(
      (f) => f.name.trim().toLowerCase() === SHARED_SPREADSHEET_NAME.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    const containsMatch = files.find((f) => f.name.toLowerCase().includes('boon huat'));
    if (containsMatch) return containsMatch;

    return files.length > 0 ? files[0] : null;
  } catch (e) {
    console.warn('findBoonHuatDatabaseId notice:', e);
    return null;
  }
}

export interface SharedAuditEntry {
  timestamp: string;
  invoiceNumber: string;
  poNumber: string;
  performedBy: string;
  role: string;
  module: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  details: string;
}

export interface GoogleSheetReadResult {
  spreadsheetName: string;
  matchingRows: string[][];
  scheduleRows: string[][];
  urgencyRows: string[][];
  paymentRows: string[][];
  auditRows?: string[][];
  worksheets: string[];
}

export const AUDIT_LOG_HEADERS = [
  'Timestamp',
  'Invoice Number',
  'PO Number',
  'Performed By',
  'Role',
  'Module',
  'Action',
  'Previous Status',
  'New Status',
  'Details',
];

export async function appendAuditLogsToSheet(
  token: string,
  spreadsheetId: string,
  entries: SharedAuditEntry[]
): Promise<void> {
  if (!entries || entries.length === 0) return;

  try {
    const metaResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!metaResp.ok) return;

    const metaData = await metaResp.json();
    const existingSheets: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title || '');

    if (!existingSheets.includes('Audit Log')) {
      const addResp = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: 'Audit Log' } } }],
          }),
        }
      );
      if (!addResp.ok) return;
    }

    let sheetHasHeaders = false;
    try {
      const headResp = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Audit Log'!A1:J1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (headResp.ok) {
        const headData = await headResp.json();
        if (headData.values && headData.values.length > 0 && headData.values[0].length > 0) {
          sheetHasHeaders = true;
        }
      }
    } catch (e) {
      console.warn('Audit Log header check notice:', e);
    }

    const rowsToAppend: string[][] = [];
    if (!sheetHasHeaders) {
      rowsToAppend.push(AUDIT_LOG_HEADERS);
    }

    for (const entry of entries) {
      rowsToAppend.push([
        entry.timestamp,
        entry.invoiceNumber,
        entry.poNumber || 'N/A',
        entry.performedBy || 'Madam Lim',
        entry.role || 'Accounts Executive',
        entry.module || 'Payment Management',
        entry.action,
        entry.previousStatus,
        entry.newStatus,
        entry.details,
      ]);
    }

    const appendResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Audit Log'!A1:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rowsToAppend,
        }),
      }
    );

    if (!appendResp.ok) {
      console.warn('Failed to append audit entries to Google Sheet:', await appendResp.text());
    }
  } catch (err) {
    console.warn('Error in appendAuditLogsToSheet:', err);
  }
}

export const PAYMENT_SCHEDULE_HEADERS = [
  'Supplier Name',
  'Invoice Number',
  'PO Number',
  'Due Date',
  'Days Remaining',
  'Payment Terms',
  'Recommendation',
];

export const URGENCY_STATUS_HEADERS = [
  'Supplier Name',
  'Invoice Number',
  'Invoice Date',
  'PO Number',
  'Item Description',
  'Invoice Total',
  'Due Date',
  'Days Remaining',
  'Urgency Status',
];

export const URGENCY_TIER_HEADERS = URGENCY_STATUS_HEADERS;

export const PAYMENT_STATUS_HEADERS = [
  'Supplier Name',
  'Invoice Number',
  'PO Number',
  'Payment Status',
  'Approver Name',
  'Approval Date',
  'Processing Date',
  'Payment Date',
  'Comments',
];

export function getPaymentRecommendation(daysDiff: number | null | undefined): string {
  if (daysDiff === null || daysDiff === undefined) return 'Monitor and Schedule Later';
  if (daysDiff < 0) return 'Pay Immediately';
  if (daysDiff <= 3) return 'Prioritise for Immediate Payment';
  if (daysDiff <= 7) return 'Pay This Week';
  if (daysDiff <= 14) return 'Schedule for Next Week';
  return 'Monitor and Schedule Later';
}

function getUrgencyRank(daysDiff: number | null | undefined): number {
  if (daysDiff === null || daysDiff === undefined) return 4;
  if (daysDiff < 0) return 1; // Overdue
  if (daysDiff <= 3) return 2; // Urgent
  if (daysDiff <= 14) return 3; // Upcoming
  return 4; // Not Due Yet
}

function getDaysRemainingText(daysDiff: number | null | undefined): string {
  if (daysDiff === null || daysDiff === undefined) return '';
  const abs = Math.abs(daysDiff);
  const unit = abs === 1 ? 'day' : 'days';
  return `${daysDiff} ${unit}`;
}

function normaliseText(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getExactColIdx(headers: string[], targetName: string, fallbacks: string[] = []): number {
  const normTarget = normaliseText(targetName);
  let idx = headers.findIndex((h) => normaliseText(h) === normTarget);
  if (idx !== -1) return idx;

  for (const fb of fallbacks) {
    const normFb = normaliseText(fb);
    idx = headers.findIndex((h) => normaliseText(h) === normFb);
    if (idx !== -1) return idx;
  }
  return -1;
}

function buildHeaderColMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (headerRow) {
    headerRow.forEach((colName, idx) => {
      map.set(normaliseText(colName), idx);
    });
  }
  return map;
}

function upsertWorksheetRows(
  existingRows: string[][],
  headers: string[],
  invoices: Invoice[],
  recordBuilder: (
    inv: Invoice,
    getExistingVal: (colName: string, defaultIdx: number) => string
  ) => Record<string, string>
): string[][] {
  const resultRows: string[][] = existingRows.length > 0 ? existingRows.map((r) => [...r]) : [];

  if (resultRows.length === 0) {
    resultRows.push([...headers]);
  } else {
    resultRows[0] = [...headers];
  }

  const existingColMap =
    existingRows.length > 0 ? buildHeaderColMap(existingRows[0]) : new Map<string, number>();

  const existingInvNumColIdx = existingRows.length > 0
    ? getExactColIdx(existingRows[0], 'Invoice Number', ['Invoice #', 'Invoice No', 'InvoiceID', 'Invoice'])
    : -1;

  const lookup = new Map<string, number>();
  for (let i = 1; i < resultRows.length; i++) {
    const row = resultRows[i];
    const colIdx = existingInvNumColIdx !== -1 ? existingInvNumColIdx : 1;
    const invNumKey = normaliseText(row[colIdx]);
    if (invNumKey) {
      lookup.set(invNumKey, i);
    }
  }

  for (const inv of invoices) {
    const invNumKey = normaliseText(inv.invoiceNumber);
    if (!invNumKey) continue;

    const existingIdx = lookup.get(invNumKey);
    const existingRow = existingIdx !== undefined ? resultRows[existingIdx] : undefined;

    const getExistingVal = (colName: string, defaultIdx: number): string => {
      if (!existingRow) return '';
      const normCol = normaliseText(colName);
      const idx = existingColMap.get(normCol) ?? defaultIdx;
      return existingRow[idx] !== undefined && existingRow[idx] !== null ? String(existingRow[idx]).trim() : '';
    };

    const record = recordBuilder(inv, getExistingVal);
    const newRow = headers.map((col) => record[col] ?? '');

    if (existingIdx !== undefined) {
      resultRows[existingIdx] = newRow;
    } else {
      resultRows.push(newRow);
      lookup.set(invNumKey, resultRows.length - 1);
    }
  }

  return resultRows;
}

/**
 * Ensures 'Payment Schedule', 'Urgency Status', and 'Payment Status' worksheets exist in the Google Sheet,
 * populates all currently imported matched invoices using exact header mapping, and verifies read-back.
 */
export async function syncToConnectedSheet(
  token: string,
  spreadsheetId: string,
  invoices: Invoice[]
): Promise<{ spreadsheetName: string; worksheets: string[] }> {
  // 1. Get spreadsheet metadata
  const metaResp = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaResp.ok) {
    const errText = await metaResp.text();
    throw new Error(`Google Sheets API error: ${metaResp.statusText} (${errText})`);
  }

  const metaData = await metaResp.json();
  const spreadsheetName = metaData.properties?.title || 'Payment Management Database';
  const sheetPropertiesList: { title: string; sheetId: number }[] = (metaData.sheets || []).map(
    (s: any) => ({
      title: s.properties?.title || '',
      sheetId: s.properties?.sheetId,
    })
  );
  const existingSheets = sheetPropertiesList.map((s) => s.title);

  const reqAddSheets: any[] = [];
  if (!existingSheets.includes('Payment Schedule')) {
    reqAddSheets.push({ addSheet: { properties: { title: 'Payment Schedule' } } });
  }

  // Rename existing "Urgency Tier" worksheet to "Urgency Status" if present, or delete it if "Urgency Status" already exists
  const urgencyTierObj = sheetPropertiesList.find((s) => s.title === 'Urgency Tier');
  const urgencyStatusObj = sheetPropertiesList.find((s) => s.title === 'Urgency Status');

  if (urgencyTierObj && urgencyTierObj.sheetId !== undefined) {
    if (!urgencyStatusObj) {
      reqAddSheets.push({
        updateSheetProperties: {
          properties: {
            sheetId: urgencyTierObj.sheetId,
            title: 'Urgency Status',
          },
          fields: 'title',
        },
      });
    } else {
      reqAddSheets.push({
        deleteSheet: {
          sheetId: urgencyTierObj.sheetId,
        },
      });
    }
  }

  if (!urgencyStatusObj && !urgencyTierObj) {
    reqAddSheets.push({ addSheet: { properties: { title: 'Urgency Status' } } });
  }

  if (!existingSheets.includes('Payment Status')) {
    reqAddSheets.push({ addSheet: { properties: { title: 'Payment Status' } } });
  }

  // Create missing worksheets or rename existing worksheet if needed
  if (reqAddSheets.length > 0) {
    const addResp = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: reqAddSheets }),
    });
    if (!addResp.ok) {
      const errText = await addResp.text();
      if (addResp.status === 401 || addResp.status === 403 || errText.includes('PERMISSION_DENIED') || errText.includes('UNAUTHENTICATED')) {
        cachedAccessToken = null;
        localStorage.removeItem('s3_access_token');
      }
      throw new Error(`Failed to create worksheets in Google Sheet (${addResp.status}): ${errText}`);
    }
  }

  // Filter matched invoices from source uploaded data
  const matchedInvoices = invoices.filter((inv) => inv.matchingStatus === 'Matched');
  const activeInvoices = matchedInvoices.filter((inv) => inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Rejected');

  // Fetch existing rows from Payment Status worksheet to perform incremental status upsert
  let existingPaymentRows: string[][] = [];

  try {
    const rangesToFetch = [
      "'Payment Status'!A1:Z",
    ];
    const batchGetResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${rangesToFetch.map(encodeURIComponent).join('&ranges=')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (batchGetResp.ok) {
      const batchData = await batchGetResp.json();
      for (const vr of batchData.valueRanges || []) {
        const rangeName: string = vr.range || '';
        if (rangeName.includes('Payment Status')) {
          existingPaymentRows = vr.values || [];
        }
      }
    }
  } catch (e) {
    console.warn('Existing values read notice:', e);
  }

  // Worksheet 1 – Payment Schedule (Active Worklist ONLY)
  const scheduleRows: string[][] = [
    PAYMENT_SCHEDULE_HEADERS,
    ...activeInvoices.map((inv) => [
      inv.supplierName || '',
      inv.invoiceNumber || '',
      inv.poNumber || '',
      inv.paymentDueDate ? formatDateDisplay(inv.paymentDueDate) : '',
      getDaysRemainingText(inv.daysDiff) || '',
      inv.paymentTerms || '',
      getPaymentRecommendation(inv.daysDiff) || '',
    ]),
  ];

  // Worksheet 2 – Urgency Status (Active Worklist ONLY)
  const urgencyRows: string[][] = [
    URGENCY_STATUS_HEADERS,
    ...activeInvoices.map((inv) => {
      const invTotalNum = inv.invoiceTotal ?? 0;
      const formattedTotal = `$${invTotalNum.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      let urgencyStatusVal = inv.urgencyTier || 'Not Due Yet';
      if (inv.daysDiff !== null && inv.daysDiff !== undefined) {
        if (inv.daysDiff < 0) urgencyStatusVal = 'Overdue';
        else if (inv.daysDiff <= 3) urgencyStatusVal = 'Urgent';
        else if (inv.daysDiff <= 14) urgencyStatusVal = 'Upcoming';
        else urgencyStatusVal = 'Not Due Yet';
      }

      return [
        inv.supplierName || '',
        inv.invoiceNumber || '',
        inv.invoiceDate ? formatDateDisplay(inv.invoiceDate) : '',
        inv.poNumber || '',
        inv.itemDescription || '',
        formattedTotal,
        inv.paymentDueDate ? formatDateDisplay(inv.paymentDueDate) : '',
        getDaysRemainingText(inv.daysDiff) || '',
        urgencyStatusVal,
      ];
    }),
  ];

  // Worksheet 3 – Payment Status (Source of Truth - All Invoices)
  const paymentRows = upsertWorksheetRows(
    existingPaymentRows,
    PAYMENT_STATUS_HEADERS,
    matchedInvoices,
    (inv, getVal) => {
      const validated = validateInvoicePaymentStatus(inv);

      const existingStatus = getVal('Payment Status', 3);
      const existingApprover = getVal('Approver Name', 4);
      const existingApprovalDate = getVal('Approval Date', 5);
      const existingProcessingDate = getVal('Processing Date', 6);
      const existingPaymentDate = getVal('Payment Date', 7);
      const existingComments = getVal('Comments', 8);

      let finalStatus = validated.paymentStatus;
      if (existingStatus) {
        const normEx = normaliseText(existingStatus);
        if (normEx.includes('paid')) {
          if (validated.paymentStatus === 'Pending Approval') finalStatus = 'Paid';
        } else if (normEx.includes('processing')) {
          if (validated.paymentStatus === 'Pending Approval') finalStatus = 'Processing';
        } else if (normEx.includes('approved')) {
          if (validated.paymentStatus === 'Pending Approval') finalStatus = 'Approved';
        }
      }

      return {
        'Supplier Name': validated.supplierName || getVal('Supplier Name', 0) || inv.supplierName,
        'Invoice Number': validated.invoiceNumber || getVal('Invoice Number', 1) || inv.invoiceNumber,
        'PO Number': validated.poNumber || getVal('PO Number', 2) || inv.poNumber,
        'Payment Status': finalStatus,
        'Approver Name': validated.approverName || existingApprover || '',
        'Approval Date': validated.approvalDate ? formatDateDisplay(validated.approvalDate) : (existingApprovalDate || ''),
        'Processing Date': validated.processingDate ? formatDateDisplay(validated.processingDate) : (existingProcessingDate || ''),
        'Payment Date': validated.paymentDate ? formatDateDisplay(validated.paymentDate) : (existingPaymentDate || ''),
        'Comments': validated.comments || existingComments || '',
      };
    }
  );

  // Clear previous values from worksheets before writing updated dataset
  try {
    await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ranges: [
            "'Payment Schedule'!A2:Z2000",
            "'Urgency Status'!A2:Z2000",
            "'Payment Status'!A2:Z2000",
          ],
        }),
      }
    );
  } catch (clearErr) {
    console.warn('Notice clearing worksheets prior to update:', clearErr);
  }

  // Write updated rows using USER_ENTERED option
  const valueUpdateResp = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'Payment Schedule'!A1:G${scheduleRows.length}`,
            values: scheduleRows,
          },
          {
            range: `'Urgency Status'!A1:I${urgencyRows.length}`,
            values: urgencyRows,
          },
          {
            range: `'Payment Status'!A1:I${paymentRows.length}`,
            values: paymentRows,
          },
        ],
      }),
    }
  );

  if (!valueUpdateResp.ok) {
    const errText = await valueUpdateResp.text();
    if (valueUpdateResp.status === 401 || valueUpdateResp.status === 403 || errText.includes('PERMISSION_DENIED') || errText.includes('UNAUTHENTICATED')) {
      cachedAccessToken = null;
      localStorage.removeItem('s3_access_token');
    }
    throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
  }

  // Verification: Read actual worksheet ranges back from Google Sheets to confirm write
  try {
    const verifyRanges = [
      "'Payment Schedule'!A1:Z2000",
      "'Urgency Status'!A1:Z2000",
      "'Payment Status'!A1:Z2000",
    ];
    const verifyResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${verifyRanges.map(encodeURIComponent).join('&ranges=')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!verifyResp.ok) {
      throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
    }

    const verifyData = await verifyResp.json();
    let vSchedRows: string[][] = [];
    let vUrgRows: string[][] = [];
    let vPayRows: string[][] = [];

    for (const vr of verifyData.valueRanges || []) {
      const rangeName: string = vr.range || '';
      if (rangeName.includes('Payment Schedule')) vSchedRows = vr.values || [];
      else if (rangeName.includes('Urgency Status')) vUrgRows = vr.values || [];
      else if (rangeName.includes('Payment Status')) vPayRows = vr.values || [];
    }

    if (matchedInvoices.length > 0) {
      if (vPayRows.length <= 1) {
        throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
      }

      const getInvNumsFromRows = (rows: string[][]) => {
        if (rows.length <= 1) return new Set<string>();
        const headers = rows[0].map((h) => String(h || ''));
        const idx = getExactColIdx(headers, 'Invoice Number', ['Invoice #', 'Invoice No', 'InvoiceID', 'Invoice']);
        const colIdx = idx !== -1 ? idx : 1;
        const set = new Set<string>();
        for (let i = 1; i < rows.length; i++) {
          const val = normaliseText(rows[i][colIdx]);
          if (val) set.add(val);
        }
        return set;
      };

      const schedNums = getInvNumsFromRows(vSchedRows);
      const urgNums = getInvNumsFromRows(vUrgRows);
      const payNums = getInvNumsFromRows(vPayRows);

      for (const inv of matchedInvoices) {
        const k = normaliseText(inv.invoiceNumber);
        if (!k) continue;

        const isActive = inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Rejected';
        if (isActive) {
          if (!schedNums.has(k) || !urgNums.has(k) || !payNums.has(k)) {
            throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
          }
        } else {
          // Paid / Rejected invoice must be in Payment Status but NOT in active worklists
          if (!payNums.has(k) || schedNums.has(k) || urgNums.has(k)) {
            throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
          }
        }
      }
    }
  } catch (verifyErr) {
    throw new Error('Eligible invoices were identified, but the Solution 3 worksheets could not be updated.');
  }

  // Apply formatting (Light green headers, bold, centered, freeze first row, wrap text, thin borders, column auto-fit & widths)
  try {
    const sheetsInfoResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (sheetsInfoResp.ok) {
      const sheetsInfoData = await sheetsInfoResp.json();
      const sheetIdMap: Record<string, number> = {};
      for (const s of sheetsInfoData.sheets || []) {
        if (s.properties?.title && s.properties?.sheetId !== undefined) {
          sheetIdMap[s.properties.title] = s.properties.sheetId;
        }
      }

      const formatRequests: any[] = [];

      const applyWorksheetFormatting = (
        sheetTitle: string,
        rowCount: number,
        colCount: number,
        columnWidths?: Record<number, number>
      ) => {
        const sId = sheetIdMap[sheetTitle];
        if (sId === undefined) return;

        // 1. Freeze row 1
        formatRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        });

        // 2. Light green header row (RGB 0.85, 0.92, 0.83), bold text, centered horizontally & vertically, wrap text
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: sId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: colCount,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.1, green: 0.25, blue: 0.1 },
                  fontSize: 10,
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'WRAP',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
          },
        });

        // 3. Data cells formatting: vertically centered, wrapped text
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: sId,
              startRowIndex: 1,
              endRowIndex: Math.max(rowCount, 20),
              startColumnIndex: 0,
              endColumnIndex: colCount,
            },
            cell: {
              userEnteredFormat: {
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'WRAP',
                textFormat: { fontSize: 10 },
              },
            },
            fields: 'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat.fontSize)',
          },
        });

        // 4. Thin borders for all populated cells
        formatRequests.push({
          updateBorders: {
            range: {
              sheetId: sId,
              startRowIndex: 0,
              endRowIndex: Math.max(rowCount, 20),
              startColumnIndex: 0,
              endColumnIndex: colCount,
            },
            top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
          },
        });

        // 5. Auto-resize all columns first
        formatRequests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId: sId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: colCount,
            },
          },
        });

        // 6. Explicit dimension pixel sizes for key columns
        if (columnWidths) {
          for (const [colIdxStr, px] of Object.entries(columnWidths)) {
            const colIdx = Number(colIdxStr);
            formatRequests.push({
              updateDimensionProperties: {
                range: {
                  sheetId: sId,
                  dimension: 'COLUMNS',
                  startIndex: colIdx,
                  endIndex: colIdx + 1,
                },
                properties: {
                  pixelSize: px,
                },
                fields: 'pixelSize',
              },
            });
          }
        }
      };

      // Apply formatting for Payment Schedule
      applyWorksheetFormatting('Payment Schedule', scheduleRows.length, PAYMENT_SCHEDULE_HEADERS.length, {
        0: 180, // Supplier Name
        1: 140, // Invoice Number
        2: 130, // PO Number
        3: 120, // Due Date
        4: 140, // Days Remaining
        5: 160, // Payment Terms
        6: 250, // Recommendation
      });

      // Apply formatting for Urgency Status
      applyWorksheetFormatting('Urgency Status', urgencyRows.length, URGENCY_STATUS_HEADERS.length, {
        0: 180, // Supplier Name
        1: 140, // Invoice Number
        2: 120, // Invoice Date
        3: 130, // PO Number
        4: 220, // Item Description
        5: 130, // Invoice Total
        6: 120, // Due Date
        7: 140, // Days Remaining
        8: 140, // Urgency Status
      });

      // Urgency Status currency formatting for Invoice Total (Column 5)
      const urgSheetId = sheetIdMap['Urgency Status'];
      if (urgSheetId !== undefined) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: urgSheetId,
              startRowIndex: 1,
              endRowIndex: Math.max(urgencyRows.length, 20),
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'CURRENCY',
                  pattern: '"$"#,##0.00',
                },
                horizontalAlignment: 'RIGHT',
              },
            },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
          },
        });
      }

      // Apply formatting for Payment Status
      applyWorksheetFormatting('Payment Status', paymentRows.length, PAYMENT_STATUS_HEADERS.length, {
        0: 180, // Supplier Name
        1: 140, // Invoice Number
        2: 130, // PO Number
        3: 150, // Payment Status
        4: 150, // Approver Name
        5: 130, // Approval Date
        6: 130, // Processing Date
        7: 130, // Payment Date
        8: 360, // Comments (expanded)
      });

      if (formatRequests.length > 0) {
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: formatRequests }),
        });
      }
    }
  } catch (fmtErr) {
    console.warn('Formatting update notice:', fmtErr);
  }

  return {
    spreadsheetName,
    worksheets: ['Payment Schedule', 'Urgency Status', 'Payment Status'],
  };
}

/**
 * Reads raw worksheet rows from connected Google Sheet ('Matching Results', 'Payment Schedule', 'Urgency Status', 'Payment Status')
 */
export async function readFromConnectedSheet(
  token: string,
  spreadsheetId: string
): Promise<GoogleSheetReadResult> {
  const metaResp = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaResp.ok) {
    const errText = await metaResp.text();
    throw new Error(`Google Sheets API error: ${metaResp.statusText} (${errText})`);
  }

  const metaData = await metaResp.json();
  const spreadsheetName = metaData.properties?.title || SHARED_SPREADSHEET_NAME;
  const existingSheets: string[] = (metaData.sheets || []).map(
    (s: any) => s.properties?.title || ''
  );

  let matchingRows: string[][] = [];
  let scheduleRows: string[][] = [];
  let urgencyRows: string[][] = [];
  let paymentRows: string[][] = [];
  let auditRows: string[][] = [];

  const rangesToFetch: string[] = [];
  if (existingSheets.includes('Matching Results')) {
    rangesToFetch.push("'Matching Results'!A1:Z2000");
  }
  if (existingSheets.includes('Payment Schedule')) {
    rangesToFetch.push("'Payment Schedule'!A1:Z2000");
  }
  if (existingSheets.includes('Urgency Status')) {
    rangesToFetch.push("'Urgency Status'!A1:Z2000");
  }
  if (existingSheets.includes('Payment Status')) {
    rangesToFetch.push("'Payment Status'!A1:Z2000");
  }
  if (existingSheets.includes('Audit Log')) {
    rangesToFetch.push("'Audit Log'!A1:J2000");
  }

  if (rangesToFetch.length > 0) {
    const batchGetResp = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${rangesToFetch.map(encodeURIComponent).join('&ranges=')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (batchGetResp.ok) {
      const batchData = await batchGetResp.json();
      for (const vr of batchData.valueRanges || []) {
        const rangeName: string = vr.range || '';
        if (rangeName.includes('Matching Results')) {
          matchingRows = vr.values || [];
        } else if (rangeName.includes('Payment Schedule')) {
          scheduleRows = vr.values || [];
        } else if (rangeName.includes('Urgency Status')) {
          urgencyRows = vr.values || [];
        } else if (rangeName.includes('Payment Status')) {
          paymentRows = vr.values || [];
        } else if (rangeName.includes('Audit Log')) {
          auditRows = vr.values || [];
        }
      }
    }
  }

  return {
    spreadsheetName,
    matchingRows,
    scheduleRows,
    urgencyRows,
    paymentRows,
    auditRows,
    worksheets:
      existingSheets.length > 0
        ? existingSheets
        : ['Payment Schedule', 'Urgency Status', 'Payment Status'],
  };
}

function normalizeToDateIso(dateStr: string | null | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return s;
}

export async function loadInvoicesFromConnectedSheet(
  token: string,
  spreadsheetId: string
): Promise<{
  invoices: Invoice[];
  spreadsheetName: string;
  totalMatchingRows: number;
  recordsExcluded: number;
  existingLoggedReviewInvoices: Set<string>;
  existingLoggedOverdueInvoices: Set<string>;
}> {
  const readResult = await readFromConnectedSheet(token, spreadsheetId);
  const { spreadsheetName, matchingRows, paymentRows, auditRows } = readResult;

  // Extract invoice numbers that already have audit entries in 'Audit Log' sheet
  const existingLoggedReviewInvoices = new Set<string>();
  const existingLoggedOverdueInvoices = new Set<string>();
  if (auditRows && auditRows.length > 1) {
    const headers = auditRows[0].map((h) => String(h || '').trim().toLowerCase());
    let invNumIdx = headers.findIndex((h) => h.includes('invoice'));
    if (invNumIdx === -1) invNumIdx = 1;
    let actionIdx = headers.findIndex((h) => h.includes('action'));
    if (actionIdx === -1) actionIdx = 6;

    for (let i = 1; i < auditRows.length; i++) {
      const row = auditRows[i];
      if (row && row[invNumIdx]) {
        const invNum = String(row[invNumIdx]).trim().toLowerCase();
        if (invNum) {
          const act = actionIdx !== -1 && row[actionIdx] ? String(row[actionIdx]).trim().toLowerCase() : '';
          if (act.includes('became overdue') || act.includes('overdue')) {
            existingLoggedOverdueInvoices.add(invNum);
          } else {
            existingLoggedReviewInvoices.add(invNum);
          }
        }
      }
    }
  }

  const getColIdx = (headers: string[], ...names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // 1. Process existing Payment Status rows to retain workflow status overrides performed by Madam Lim
  const existingStatusMap = new Map<string, Partial<Invoice>>();

  if (paymentRows && paymentRows.length > 1) {
    const headers = paymentRows[0].map((h) => String(h || '').trim());
    const supplierIdx = getColIdx(headers, 'supplier name', 'supplier');
    const invNumIdx = getColIdx(headers, 'invoice number', 'invoice #', 'invoicenumber');
    const poIdx = getColIdx(headers, 'po number', 'ponumber', 'po');
    const statusIdx = getColIdx(headers, 'payment status', 'status');
    const approverIdx = getColIdx(headers, 'approver name', 'approver');
    const appDateIdx = getColIdx(headers, 'approval date');
    const procDateIdx = getColIdx(headers, 'processing date');
    const payDateIdx = getColIdx(headers, 'payment date');
    const commentsIdx = getColIdx(headers, 'comments', 'remarks', 'notes');

    for (let i = 1; i < paymentRows.length; i++) {
      const row = paymentRows[i];
      const invNum = invNumIdx !== -1 && row[invNumIdx] ? String(row[invNumIdx]).trim() : '';
      if (!invNum) continue;

      const key = invNum.toLowerCase();

      let rawStatus = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : 'Pending Approval';
      let paymentStatus: PaymentStatus = 'Pending Approval';
      const psLower = rawStatus.toLowerCase();
      if (psLower.includes('paid')) paymentStatus = 'Paid';
      else if (psLower.includes('processing')) paymentStatus = 'Processing';
      else if (psLower.includes('approved')) paymentStatus = 'Approved';
      else if (psLower.includes('reject')) paymentStatus = 'Rejected';
      else paymentStatus = 'Pending Approval';

      const statusRecord: Partial<Invoice> = {
        supplierName: supplierIdx !== -1 && row[supplierIdx] ? String(row[supplierIdx]).trim() : '',
        invoiceNumber: invNum,
        poNumber: poIdx !== -1 && row[poIdx] ? String(row[poIdx]).trim() : '',
        paymentStatus,
        approverName: (approverIdx !== -1 && row[approverIdx] ? String(row[approverIdx]).trim() : null) || null,
        approvalDate: (appDateIdx !== -1 && row[appDateIdx] ? String(row[appDateIdx]).trim() : null) || null,
        processingDate: (procDateIdx !== -1 && row[procDateIdx] ? String(row[procDateIdx]).trim() : null) || null,
        paymentDate: (payDateIdx !== -1 && row[payDateIdx] ? String(row[payDateIdx]).trim() : null) || null,
        comments: (commentsIdx !== -1 && row[commentsIdx] ? String(row[commentsIdx]).trim() : '') || '',
      };

      existingStatusMap.set(key, statusRecord);
    }
  }

  // 2. Read ONLY from 'Matching Results' worksheet (Verification Status = Matched & Decision = Approved)
  let totalMatchingRows = 0;
  let recordsExcluded = 0;
  const eligibleInvoicesMap = new Map<string, Invoice>();

  if (matchingRows && matchingRows.length > 1) {
    const headers = matchingRows[0].map((h) => String(h || ''));
    const supplierIdx = getExactColIdx(headers, 'Supplier Name', ['Supplier', 'Vendor Name', 'Vendor']);
    const invNumIdx = getExactColIdx(headers, 'Invoice Number', ['Invoice #', 'Invoice No', 'InvoiceID', 'Invoice']);
    const dateIdx = getExactColIdx(headers, 'Invoice Date', ['InvoiceDate', 'Date']);
    const poIdx = getExactColIdx(headers, 'PO Number', ['PONumber', 'PO #', 'PO']);
    const itemDescIdx = getExactColIdx(headers, 'Item Description', ['Description', 'Item']);
    const totalIdx = getExactColIdx(headers, 'Invoice Total', ['InvoiceTotal', 'Total', 'Amount', 'SGD Total', 'Total Amount']);
    const dueDateIdx = getExactColIdx(headers, 'Payment Due Date', ['Due Date', 'PaymentDueDate', 'DueDate']);
    const termsIdx = getExactColIdx(headers, 'Payment Terms', ['Terms', 'PaymentTerms']);
    const verStatusIdx = getExactColIdx(headers, 'Verification Status', ['VerificationStatus']);
    const decisionIdx = getExactColIdx(headers, 'Decision', ['Approval Status', 'ApprovalStatus']);

    for (let i = 1; i < matchingRows.length; i++) {
      const row = matchingRows[i];
      if (!row || row.every((cell) => !normaliseText(cell))) continue;

      totalMatchingRows++;

      const invNum = invNumIdx !== -1 && row[invNumIdx] ? String(row[invNumIdx]).replace(/\u00A0/g, ' ').trim() : '';
      const verVal = verStatusIdx !== -1 && row[verStatusIdx] ? String(row[verStatusIdx]).trim() : '';
      const decVal = decisionIdx !== -1 && row[decisionIdx] ? String(row[decisionIdx]).trim() : '';

      const normVer = normaliseText(verVal);
      const normDec = normaliseText(decVal);

      // Strictly filter: Verification Status = Matched AND Decision = Approved
      if (!invNum || normVer !== 'matched' || normDec !== 'approved') {
        recordsExcluded++;
        continue;
      }

      const key = normaliseText(invNum);

      // Duplicate invoice number check within Matching Results
      if (eligibleInvoicesMap.has(key)) {
        recordsExcluded++;
        continue;
      }

      // Check if workflow status already exists in Payment Status sheet
      const existingStatus = existingStatusMap.get(key);

      let rawTotal = totalIdx !== -1 && row[totalIdx] ? String(row[totalIdx]) : '0';
      let totalNum = parseFloat(rawTotal.replace(/[^0-9.-]+/g, '')) || 0;

      const supplierName = supplierIdx !== -1 && row[supplierIdx] ? String(row[supplierIdx]).trim() : '';
      const invoiceDate = dateIdx !== -1 && row[dateIdx] ? String(row[dateIdx]).trim() : '';
      const poNumber = poIdx !== -1 && row[poIdx] ? String(row[poIdx]).trim() : '';
      const itemDescription = itemDescIdx !== -1 && row[itemDescIdx] ? String(row[itemDescIdx]).trim() : '';
      const paymentDueDate = dueDateIdx !== -1 && row[dueDateIdx] ? String(row[dueDateIdx]).trim() : null;
      const paymentTerms = termsIdx !== -1 && row[termsIdx] ? String(row[termsIdx]).trim() : null;

      const rawInv: Invoice = {
        id: `inv-gs-${invNum}-${i}`,
        supplierName: supplierName || existingStatus?.supplierName || '',
        invoiceNumber: invNum,
        invoiceDate: normalizeToDateIso(invoiceDate) || '',
        poNumber: poNumber || existingStatus?.poNumber || 'N/A',
        itemDescription: itemDescription || '',
        invoiceTotal: totalNum,
        paymentDueDate: normalizeToDateIso(paymentDueDate),
        paymentTerms: paymentTerms || null,
        matchingStatus: 'Matched',
        urgencyTier: 'Needs Review',
        recommendationReason: '',
        paymentStatus: existingStatus?.paymentStatus || 'Pending Approval',
        approverName: existingStatus?.approverName || null,
        approvalDate: existingStatus?.approvalDate || null,
        processingDate: existingStatus?.processingDate || null,
        paymentDate: existingStatus?.paymentDate || null,
        comments: existingStatus?.comments || '',
      };

      eligibleInvoicesMap.set(key, validateInvoicePaymentStatus(rawInv));
    }
  }

  const invoices = Array.from(eligibleInvoicesMap.values());

  return {
    invoices,
    spreadsheetName,
    totalMatchingRows,
    recordsExcluded,
    existingLoggedReviewInvoices,
    existingLoggedOverdueInvoices,
  };
}

export async function listUserGoogleSheets(token: string): Promise<GoogleDriveSheet[]> {
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const response = await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&pageSize=25&orderBy=modifiedTime desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 401 || response.status === 403 || errText.includes('PERMISSION_DENIED') || errText.includes('UNAUTHENTICATED')) {
      cachedAccessToken = null;
      localStorage.removeItem('s3_access_token');
    }
    throw new Error(`Google Drive API error (${response.status}): ${response.statusText} (${errText})`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function fetchSpreadsheetData(
  token: string,
  spreadsheetId: string,
  range: string = 'A1:Z500'
): Promise<{ invoices: Invoice[]; rawRowsCount: number; sheetTitle: string }> {
  // Get spreadsheet sheet name
  const metaResp = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  let targetRange = range;
  let sheetTitle = 'Sheet1';
  if (metaResp.ok) {
    const metaData = await metaResp.json();
    if (metaData.sheets && metaData.sheets.length > 0) {
      sheetTitle = metaData.sheets[0].properties.title;
      targetRange = `'${sheetTitle}'!A1:Z500`;
    }
  }

  const response = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 401 || response.status === 403 || errText.includes('PERMISSION_DENIED') || errText.includes('UNAUTHENTICATED')) {
      cachedAccessToken = null;
      localStorage.removeItem('s3_access_token');
    }
    throw new Error(`Google Sheets API error: ${response.statusText} (${errText})`);
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  if (rows.length < 2) {
    return { invoices: [], rawRowsCount: rows.length, sheetTitle };
  }

  const headers = rows[0].map((h) => String(h).trim().toLowerCase());

  const getColIdx = (...possibleNames: string[]): number => {
    for (const p of possibleNames) {
      const idx = headers.findIndex((h) => h === p.trim().toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const supplierIdx = getColIdx('supplier name', 'suppliername', 'supplier', 'vendor name', 'vendor');
  const invoiceNumIdx = getColIdx(
    'invoice number',
    'invoicenumber',
    'invoice #',
    'invoiceno',
    'invoice id',
    'invoice'
  );
  const dateIdx = getColIdx('invoice date', 'invoicedate', 'date');
  const poIdx = getColIdx('po number', 'ponumber', 'po #', 'po');
  const totalIdx = getColIdx(
    'invoice total',
    'invoicetotal',
    'total amount',
    'amount',
    'total',
    'invoice amount',
    'sgd total'
  );
  const dueDateIdx = getColIdx('payment due date', 'paymentduedate', 'due date', 'duedate');
  const termsIdx = getColIdx('payment terms', 'paymentterms', 'terms', 'terms code');
  const matchStatusIdx = getColIdx('matching status', 'matchingstatus', 'status', 'match status');
  const paymentStatusIdx = getColIdx('payment status', 'paymentstatus');
  const commentsIdx = getColIdx('comments', 'reason', 'recommendation reason', 'remarks', 'notes');
  const approverIdx = getColIdx('approver name', 'approver');

  const invoices: Invoice[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const supplierName = supplierIdx !== -1 && row[supplierIdx] ? String(row[supplierIdx]).trim() : '';
    const invoiceNumber = invoiceNumIdx !== -1 && row[invoiceNumIdx] ? String(row[invoiceNumIdx]).trim() : '';

    if (!supplierName && !invoiceNumber) continue;

    const invoiceDate =
      dateIdx !== -1 && row[dateIdx] ? String(row[dateIdx]).trim() : new Date().toISOString().split('T')[0];
    const poNumber = poIdx !== -1 && row[poIdx] ? String(row[poIdx]).trim() : 'N/A';

    let rawTotalStr = totalIdx !== -1 && row[totalIdx] ? String(row[totalIdx]) : '0';
    let invoiceTotal = parseFloat(rawTotalStr.replace(/[^0-9.-]+/g, '')) || 0;

    let paymentDueDate = dueDateIdx !== -1 && row[dueDateIdx] ? String(row[dueDateIdx]).trim() : null;
    let paymentTerms = termsIdx !== -1 && row[termsIdx] ? String(row[termsIdx]).trim() : null;

    let rawMatchingStatus =
      matchStatusIdx !== -1 && row[matchStatusIdx] ? String(row[matchStatusIdx]).trim() : 'Matched';
    if (!rawMatchingStatus.toLowerCase().includes('matched')) {
      continue; // Match Solution 3 requirement: only retrieve Matched status
    }

    let paymentStatus: any = 'Pending Approval';
    if (paymentStatusIdx !== -1 && row[paymentStatusIdx]) {
      const ps = String(row[paymentStatusIdx]).toLowerCase();
      if (ps.includes('paid')) paymentStatus = 'Paid';
      else if (ps.includes('processing')) paymentStatus = 'Processing';
      else if (ps.includes('approved')) paymentStatus = 'Approved';
    }

    const comments = commentsIdx !== -1 && row[commentsIdx] ? String(row[commentsIdx]).trim() : '';
    const approverName = approverIdx !== -1 && row[approverIdx] ? String(row[approverIdx]).trim() : null;

    invoices.push({
      id: `inv-gs-${invoiceNumber || i}-${Date.now()}`,
      supplierName: supplierName || 'Supplier',
      invoiceNumber: invoiceNumber || `INV-${i}`,
      invoiceDate,
      poNumber,
      invoiceTotal,
      paymentDueDate,
      paymentTerms,
      matchingStatus: 'Matched',
      urgencyTier: 'Needs Review',
      recommendationReason: '',
      paymentStatus,
      approverName,
      approvalDate: null,
      processingDate: null,
      paymentDate: null,
      comments,
    });
  }

  return { invoices, rawRowsCount: rows.length - 1, sheetTitle };
}

export async function createGoogleSheetExport(
  token: string,
  invoices: Invoice[],
  title: string = SHARED_SPREADSHEET_NAME
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const headers = [
    'Supplier Name',
    'Invoice Number',
    'Invoice Date',
    'PO Number',
    'Invoice Total',
    'Payment Due Date',
    'Payment Terms',
    'Matching Status',
    'Urgency Status',
    'Payment Status',
    'Recommendation Reason',
    'Approver Name',
    'Approval Date',
    'Processing Date',
    'Payment Date',
    'Comments',
  ];

  const values = [
    headers,
    ...invoices.map((inv) => [
      inv.supplierName,
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.poNumber,
      inv.invoiceTotal,
      inv.paymentDueDate || '',
      inv.paymentTerms || '',
      inv.matchingStatus,
      inv.urgencyTier,
      inv.paymentStatus,
      inv.recommendationReason,
      inv.approverName || '',
      inv.approvalDate || '',
      inv.processingDate || '',
      inv.paymentDate || '',
      inv.comments,
    ]),
  ];

  const response = await fetchWithRetry('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: 'Payment Schedule' },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: values.map((row) => ({
                values: row.map((val) => ({
                  userEnteredValue:
                    typeof val === 'number'
                      ? { numberValue: val }
                      : { stringValue: String(val) },
                })),
              })),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create Google Sheet: ${err}`);
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}
