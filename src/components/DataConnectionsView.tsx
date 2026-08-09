import React, { useRef } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  Eye,
  UploadCloud,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { Invoice } from '../types';

interface DataConnectionsViewProps {
  invoices: Invoice[];
  lastSyncedAt: string;
  onOpenGoogleSheetModal: () => void;
  onFileUpload: (file: File) => void;
  uploadedFileName?: string | null;
}

export const DataConnectionsView: React.FC<DataConnectionsViewProps> = ({
  invoices,
  lastSyncedAt,
  onOpenGoogleSheetModal,
  onFileUpload,
  uploadedFileName,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const columnHeaders = [
    'Supplier Name',
    'Invoice Number',
    'Invoice Date',
    'PO Number',
    'Item Description',
    'Quantity',
    'Unit Price',
    'Invoice Total',
    'Due Date',
    'Payment Terms',
    'Status',
    'Reason',
    'Original File Name',
    'Original File Link',
    'Processed Date and Time',
    'Reviewed By',
  ];

  const matchedInvoicesCount = invoices.filter((inv) => inv.matchingStatus === 'Matched').length;
  const isUploaded = invoices.length > 0;

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

      {/* Top Bar with Status and Actions */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Data Connections</h1>
            {isUploaded ? (
              <span className="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                Connected &amp; Synced
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                Awaiting Database
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Retrieve Matched Invoice Database exported from Solution 2
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isUploaded && (
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <span className="flex items-center space-x-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Matched Invoice DB</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono text-[11px]">Last Sync: {lastSyncedAt}</span>
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Matched Invoice Database</span>
          </button>
        </div>
      </div>

      {/* Matched Invoice Database Single Source Card */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Matched Invoice Database</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Output from Solution 3-Way Matching Engine (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenGoogleSheetModal}
              className="flex items-center space-x-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Google Sheets Connection</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Local File</span>
            </button>
          </div>
        </div>

        {/* Connection Status Banner */}
        <div className={`border rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
          isUploaded
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div>
            Current File: <span className="font-bold font-mono text-slate-900">{uploadedFileName || 'No file uploaded yet'}</span>
          </div>
          <div className="font-bold flex items-center space-x-1.5">
            {isUploaded ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Connection Status: Connected &amp; Active</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Connection Status: No Matched Database Uploaded</span>
              </>
            )}
          </div>
        </div>

        {/* Extracted Invoice Details */}
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Extracted Matched Invoice Summary</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">NUMBER OF MATCHED INVOICES IMPORTED</span>
              <span className="text-lg font-black text-emerald-700 mt-1 block">{matchedInvoicesCount}</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">FILTERING CRITERIA</span>
              <span className="text-xs font-semibold text-slate-700 mt-1 block">Matching Status = Matched</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-2">Detected Column Headers (16 Fields Mapped):</div>
            <div className="flex flex-wrap gap-1.5">
              {columnHeaders.map((col) => (
                <span
                  key={col}
                  className="bg-blue-50 text-blue-800 text-[11px] font-medium px-2.5 py-1 rounded-md border border-blue-200"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
