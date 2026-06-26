
import { useEffect, useState, useRef } from "react";
import { UploadCloud, FileType, CheckCircle2, AlertCircle, X, Plus, Trash2 } from "lucide-react";
import { uploadTemplateApi, fetchTemplatesApi, deleteTemplateApi, TemplateItem } from "@/services/template";
import { createPortal } from "react-dom";

export default function TemplateUploadPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemToDelete, setItemToDelete] = useState<TemplateItem | null>(null);
  const ITEMS_PER_PAGE = 10;

  // Upload modal state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".pdf", ".csv", ".doc", ".docx", ".ppt", ".pptx"];

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600)); // Show skeleton loader
      const data = await fetchTemplatesApi();
      setTemplates(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleFile(selectedFile: File | null) {
    setError("");
    setSuccess("");
    if (!selectedFile) return;

    const ext = "." + selectedFile.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
      setFile(null);
      return;
    }
    setFile(selectedFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(20);
    setError("");
    setSuccess("");

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(p => (p < 90 ? p + 10 : p));
      }, 200);

      await uploadTemplateApi(file);
      
      clearInterval(progressInterval);
      setProgress(100);
      
      // Reset and close
      setFile(null);
      setIsModalOpen(false);
      loadTemplates(); // refresh list
    } catch (err: any) {
      setError(err.message || "Failed to upload file");
      setProgress(0);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteConfirm() {
    if (!itemToDelete) return;
    try {
      await deleteTemplateApi(itemToDelete.id);
      setItemToDelete(null);
      loadTemplates();
    } catch (err: any) {
      alert(err.message || "Failed to delete template");
    }
  }

  return (
    <div className="p-6 w-full space-y-6">
      {loading ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="w-36 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
            >
              <UploadCloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Template Upload</h1>
              <p className="text-sm text-gray-500">Manage and upload templates for processing</p>
            </div>
          </div>

          <button
            onClick={() => {
              setFile(null);
              setError("");
              setSuccess("");
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Upload Template
          </button>
        </div>
      )}

      {/* Templates List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl animate-pulse border border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
                <div className="flex gap-12">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center border-t border-gray-50">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <FileType className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">No templates found</p>
            <p className="text-xs text-gray-500 mt-1">Upload a template to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">S.No</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">File Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Upload Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Uploaded By</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates
                  .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                  .map((tpl, i) => (
                  <tr key={tpl.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                        {(currentPage - 1) * ITEMS_PER_PAGE + i + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileType className="w-5 h-5 text-blue-500" />
                        <span className="text-sm font-medium text-gray-900">{tpl.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(tpl.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                          {tpl.creator?.employee_name?.substring(0, 2).toUpperCase() || "SY"}
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {tpl.creator?.employee_name || tpl.creator?.employee_id || "System"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(tpl.size / 1024 / 1024).toFixed(2)} MB</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setItemToDelete(tpl)}
                        className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {templates.length > ITEMS_PER_PAGE && (() => {
              const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);
              return (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/30">
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span>–<span className="font-semibold text-gray-700">{Math.min(currentPage * ITEMS_PER_PAGE, templates.length)}</span> of <span className="font-semibold text-gray-700">{templates.length}</span> templates
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${
                          page === currentPage
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Upload Modal (Portal) */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => !uploading && setIsModalOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">Upload Template</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={uploading}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${file ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  accept=".xlsx,.xls,.pdf,.csv,.doc,.docx,.ppt,.pptx"
                />

                {!file ? (
                  <>
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                      <UploadCloud className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800">Drag & Drop your file here</h3>
                    <p className="text-sm text-gray-500 mt-2 text-center max-w-sm">
                      Supported formats: <br/>
                      <span className="font-medium text-gray-700">Excel, PDF, CSV, Word, PowerPoint</span>
                    </p>
                    <button 
                      className="mt-6 px-6 py-2.5 bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Browse Files
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center w-full">
                    <FileType className="w-12 h-12 text-blue-600 mb-3" />
                    <p className="text-sm font-medium text-gray-800 break-all text-center">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    
                    {!uploading && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setSuccess("");
                          setError("");
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Remove File
                      </button>
                    )}
                  </div>
                )}
              </div>

              {uploading && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-gray-600">
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md hover:opacity-90 disabled:hover:shadow-sm"
                style={{ background: "linear-gradient(135deg, #1d55e8, #1235b0)" }}
              >
                <UploadCloud className="w-4 h-4" />
                {uploading ? "Uploading..." : "Upload Template"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setItemToDelete(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Template?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to permanently delete <span className="font-semibold text-gray-800">{itemToDelete.filename}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setItemToDelete(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
