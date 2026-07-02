"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import { FileText, Upload, AlertCircle } from "lucide-react";
import NoDocuments from "../../../components/visuals/NoDocuments";

export default function DocumentsPage() {
  const { activeWorkspace } = useTerminal();
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");

  const loadDocuments = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getDocuments(activeWorkspace.id);
      setDocuments(data);
      if (data.length > 0) {
        setSelectedDoc(data[0]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load documents. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  // Poll for document updates when a document is in progress
  useEffect(() => {
    if (!activeWorkspace) return;
    const hasActiveJobs = documents.some(
      (doc) => doc.status === "pending" || doc.status === "processing",
    );
    if (!hasActiveJobs) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.getDocuments(activeWorkspace.id);
        setDocuments(data);
        if (selectedDoc) {
          const updated = data.find((d: any) => d.id === selectedDoc.id);
          if (updated) {
            setSelectedDoc(updated);
          }
        }
      } catch (err) {
        console.error("Polling documents failed", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [documents, activeWorkspace, selectedDoc]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.substring(base64String.indexOf(",") + 1);
      setFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !fileName.trim()) return;
    setUploadError("");
    try {
      await api.uploadDocument(activeWorkspace.id, {
        fileName: fileName.trim(),
        fileBase64: fileBase64 || btoa("Default empty file content"),
        entityType: "property",
        documentType: "lease_agreement",
      });
      setFileName("");
      setFileBase64("");
      const fileInput = document.getElementById("fileIngestionInput") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      await loadDocuments();
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to upload document.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary font-mono text-xs">
        LOADING DILIGENCE extractions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-mono p-4 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border-default pb-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          DOCUMENT MANAGER
        </h1>
        <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
          Diligence extractions, OCR verification registers, and source lineages
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
              <Upload className="h-4 w-4 text-accent-intelligence" />
              <span>Upload Diligence File</span>
            </h2>
            <div className="bg-success/10 border border-success/30 rounded-sm p-3 text-[10px] text-success font-mono mb-2">
              <strong>[PIPELINE ONLINE]</strong> Document ingestion is active.
              Upload lease agreements to extract investment evidence.
            </div>
            {uploadError && (
              <div className="bg-danger/10 border border-danger/30 rounded-sm p-3 text-[10px] text-danger font-mono mb-2">
                {uploadError}
              </div>
            )}
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label
                  htmlFor="fileIngestionInput"
                  className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1"
                >
                  Choose Document File
                </label>
                <input
                  id="fileIngestionInput"
                  type="file"
                  required
                  onChange={handleFileChange}
                  className="w-full bg-bg-base border border-border-default rounded-sm p-2 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono file:mr-2 file:py-1 file:px-2 file:border-0 file:text-[10px] file:font-semibold file:bg-accent-intelligence file:text-text-inverse cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={!fileName || !fileBase64}
                className="w-full bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse font-semibold py-2 px-3 rounded-sm text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </button>
            </form>
          </div>

          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4">
              Ingested Registry
            </h2>

            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`w-full text-left p-3 rounded-sm border transition-all duration-120 flex items-center gap-3 cursor-pointer ${
                        isSelected
                          ? "bg-selected border-accent-intelligence text-text-primary"
                          : "bg-bg-base border-border-subtle hover:border-border-strong text-text-secondary"
                      }`}
                    >
                      <FileText className="h-4 w-4 text-accent-intelligence shrink-0" />
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold truncate">
                          {doc.fileName}
                        </div>
                        <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mt-0.5">
                          {doc.documentType}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <NoDocuments className="h-16 w-16 mb-2 text-text-muted" />
                <p className="text-[10px] text-text-muted font-mono">
                  No documents found in workspace
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-2">
          {selectedDoc ? (
            <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-6">
              <div className="border-b border-border-subtle pb-3 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">
                    OCR Extraction Dossier
                  </h3>
                  <p className="text-[10px] font-mono text-text-muted mt-1 uppercase">
                    File ID: {selectedDoc.id}
                  </p>
                </div>
                {selectedDoc.status === "failed" ? (
                  <span className="bg-danger/15 text-danger border border-danger/30 px-2 py-0.5 rounded-xs text-[10px] font-mono uppercase">
                    Extraction Failed
                  </span>
                ) : selectedDoc.status === "pending" ? (
                  <span className="bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 rounded-xs text-[10px] font-mono uppercase">
                    Extraction Pending
                  </span>
                ) : (
                  <span className="bg-success/15 text-success border border-success/30 px-2 py-0.5 rounded-xs text-[10px] font-mono uppercase">
                    Extraction Completed
                  </span>
                )}
              </div>

              {selectedDoc.status === "failed" ? (
                <div className="p-4 bg-danger/5 border border-danger/20 text-danger rounded-sm flex gap-3 items-start text-xs font-mono">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block uppercase text-[9px] tracking-wider">
                      OCR Pipeline Offline
                    </span>
                    <span className="mt-1 block text-text-secondary leading-relaxed">
                      {selectedDoc.errorMessage ||
                        "OCR document extraction pipeline failed to respond."}
                    </span>
                    <span className="mt-2 block text-text-muted text-[10px]">
                      Recommended Action: Configure real-world Azure Document
                      Intelligence or Google Document AI credentials in your
                      workspace administration panel.
                    </span>
                  </div>
                </div>
              ) : selectedDoc.extractions?.[0] ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
                      Parsed Entity Fields
                    </h4>
                    <div className="bg-bg-base border border-border-subtle rounded-sm overflow-hidden">
                      <div className="grid grid-cols-3 bg-bg-surface/50 p-2 text-[10px] font-mono text-text-muted uppercase border-b border-border-subtle">
                        <div className="px-2">Field</div>
                        <div className="px-2">Extracted Value</div>
                        <div className="px-2 text-right">Confidence</div>
                      </div>
                      {Object.entries(
                        selectedDoc.extractions[0].fieldsJson || {},
                      ).map(([key, val]: any) => {
                        const confidence =
                          selectedDoc.extractions[0].confidenceJson?.[key] ||
                          1.0;
                        const isHigh = confidence >= 0.95;
                        return (
                          <div
                            key={key}
                            className="grid grid-cols-3 p-3 border-b border-border-subtle/40 hover:bg-hover font-mono text-xs items-center"
                          >
                            <div className="px-2 text-text-secondary font-sans font-semibold">
                              {key}
                            </div>
                            <div className="px-2 text-text-primary font-bold">
                              {String(val)}
                            </div>
                            <div className="px-2 text-right">
                              <span
                                className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold ${
                                  isHigh
                                    ? "bg-success/10 text-success"
                                    : "bg-warning/10 text-warning"
                                }`}
                              >
                                {(confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedDoc.extractions[0].missingItemsJson?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
                        Diligence Gaps / Missing Items
                      </h4>
                      <div className="space-y-2 text-xs">
                        {selectedDoc.extractions[0].missingItemsJson.map(
                          (item: string, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 bg-warning/10 border border-warning/30 text-warning rounded-sm flex gap-2 items-start"
                            >
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block uppercase text-[9px] font-mono tracking-wider">
                                  Missing Required Evidence
                                </span>
                                <span className="mt-0.5 block text-text-secondary">
                                  {item}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {selectedDoc.extractions[0].sourceSpansJson?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
                        OCR Document Spans
                      </h4>
                      <div className="space-y-2">
                        {selectedDoc.extractions[0].sourceSpansJson.map(
                          (span: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 bg-bg-base border border-border-subtle rounded-sm flex justify-between items-center text-xs"
                            >
                              <div>
                                <span className="text-[9px] font-mono text-text-muted uppercase block">
                                  Field: {span.field}
                                </span>
                                <span className="text-text-primary italic font-serif">
                                  "{span.text}"
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[9px] font-mono text-text-muted block">
                                  Byte Span
                                </span>
                                <span className="text-text-primary font-mono text-[10px]">
                                  {span.start} - {span.end}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedDoc.status === "pending" ||
                selectedDoc.status === "processing" ? (
                <div className="text-center py-12 text-text-muted text-xs font-mono space-y-2">
                  <div className="font-bold text-warning animate-pulse">
                    Running document extraction pipeline...
                  </div>
                  <div className="text-[10px] text-text-muted max-w-sm mx-auto leading-relaxed mt-1">
                    OCR extraction takes approximately 10-15 seconds. If this
                    process hangs indefinitely, please verify your Document AI
                    API credentials in your workspace settings or refresh the
                    page.
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-text-muted text-xs font-mono">
                  No extraction results or dossier available.
                </div>
              )}
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-default rounded-md p-12 text-center text-text-muted text-xs font-mono">
              {documents.length === 0
                ? "Upload a diligence lease document on the left panel to begin OCR extraction."
                : "Select an ingested file to verify OCR data lineage."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
