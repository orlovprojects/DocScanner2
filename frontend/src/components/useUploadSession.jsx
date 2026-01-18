// src/components/useUploadSession.jsx

import { useState, useCallback, useRef } from "react";
import { api } from "../api/endpoints";

// ============ ЛИМИТЫ ============
// Батчи (для простых файлов)
const MAX_BATCH_FILES = 50;
const MAX_BATCH_BYTES = 250 * 1024 * 1024; // 250 MB

// Chunks (для архивов)
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

// Лимиты на один файл
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB для обычных файлов
const MAX_SINGLE_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB для одного архива

// Лимиты на весь upload
const MAX_TOTAL_FILES = 2000;          // макс файлов + архивов за upload
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB общий размер
const MAX_ARCHIVES_PER_UPLOAD = 100;   // макс архивов (если только архивы)
const MAX_ARCHIVES_IN_MIX = 100;        // макс архивов (если микс с файлами)
// ================================

const ARCHIVE_EXTS = [
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".tgz",
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tbz2",
];

const IMAGE_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".jpe",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".hif",
  ".heifs",
  ".avif",
];

const OFFICE_EXTS = [".doc", ".docx", ".xls", ".xlsx"];
const HTML_EXTS = [".html", ".htm"];

const SUPPORTED_EXTS = [
  ".pdf",
  ...IMAGE_EXTS,
  ...OFFICE_EXTS,
  ...HTML_EXTS,
  ...ARCHIVE_EXTS,
];

const getFileExt = (filename) => {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  if (lower.endsWith(".tar.bz2")) return ".tar.bz2";
  if (lower.endsWith(".tar.xz")) return ".tar.xz";
  const match = lower.match(/\.[^.]+$/);
  return match ? match[0] : "";
};

const isArchive = (filename) => {
  const ext = getFileExt(filename);
  return ARCHIVE_EXTS.includes(ext);
};

const isSupportedFormat = (filename) => {
  const ext = getFileExt(filename);
  return SUPPORTED_EXTS.includes(ext);
};

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Валидация файлов с учётом всех лимитов
 * Возвращает: { valid, skipped, errors }
 * - valid: файлы которые можно загрузить
 * - skipped: файлы пропущенные из-за формата/размера
 * - errors: критические ошибки (превышены общие лимиты)
 */
function validateFiles(files) {
  const valid = [];
  const skipped = [];
  const errors = [];

  let totalBytes = 0;
  let archiveCount = 0;
  let archiveTotalBytes = 0;
  let regularCount = 0;

  for (const file of files) {
    const filename = file.name || "";
    const size = file.size || 0;
    const isArch = isArchive(filename);

    // Check format
    if (!isSupportedFormat(filename)) {
      skipped.push({
        name: filename,
        reason: "nepalaikomas formatas",
      });
      continue;
    }

    // Check size for regular files
    if (!isArch && size > MAX_SINGLE_FILE_BYTES) {
      skipped.push({
        name: filename,
        reason: `per didelis failas (${formatBytes(size)}, max ${formatBytes(MAX_SINGLE_FILE_BYTES)})`,
      });
      continue;
    }

    // Check size for archives
    if (isArch && size > MAX_SINGLE_ARCHIVE_BYTES) {
      skipped.push({
        name: filename,
        reason: `per didelis archyvas (${formatBytes(size)}, max ${formatBytes(MAX_SINGLE_ARCHIVE_BYTES)})`,
      });
      continue;
    }

    valid.push(file);
    totalBytes += size;
    
    if (isArch) {
      archiveCount++;
      archiveTotalBytes += size;
    } else {
      regularCount++;
    }
  }

  // ============ Проверка общих лимитов ============
  
  const totalCount = valid.length;
  const isMix = archiveCount > 0 && regularCount > 0;
  const isOnlyArchives = archiveCount > 0 && regularCount === 0;

  // Общее кол-во файлов
  if (totalCount > MAX_TOTAL_FILES) {
    errors.push(`Per daug failų: ${totalCount} (max ${MAX_TOTAL_FILES})`);
  }

  // Общий размер
  if (totalBytes > MAX_TOTAL_BYTES) {
    errors.push(`Per didelis bendras dydis: ${formatBytes(totalBytes)} (max ${formatBytes(MAX_TOTAL_BYTES)})`);
  }

  // Лимит архивов
  if (isOnlyArchives && archiveCount > MAX_ARCHIVES_PER_UPLOAD) {
    errors.push(`Per daug archyvų: ${archiveCount} (max ${MAX_ARCHIVES_PER_UPLOAD})`);
  }

  if (isMix && archiveCount > MAX_ARCHIVES_IN_MIX) {
    errors.push(`Per daug archyvų kartu su failais: ${archiveCount} (max ${MAX_ARCHIVES_IN_MIX})`);
  }

  // Общий размер архивов
  if (archiveTotalBytes > MAX_TOTAL_BYTES) {
    errors.push(`Per didelis archyvų bendras dydis: ${formatBytes(archiveTotalBytes)} (max ${formatBytes(MAX_TOTAL_BYTES)})`);
  }

  return { valid, skipped, errors };
}

// Умное разделение на батчи по количеству И размеру
function splitIntoBatches(files) {
  const batches = [];
  let currentBatch = [];
  let currentBytes = 0;

  for (const file of files) {
    const fileSize = file.size || 0;

    if (
      currentBatch.length >= MAX_BATCH_FILES ||
      (currentBytes + fileSize > MAX_BATCH_BYTES && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(file);
    currentBytes += fileSize;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export function useUploadSession({ onUploadComplete, onError }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
    bytes: 0,
    totalBytes: 0,
    phase: "uploading",
    currentFile: "",
  });
  const [error, setError] = useState(null);
  const [skippedFiles, setSkippedFiles] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const abortRef = useRef(false);

  const clearSkipped = useCallback(() => {
    setSkippedFiles([]);
  }, []);

  const clearValidationErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

  // Upload archive chunked
  const uploadArchiveChunked = async (sid, file, onChunkProgress) => {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    console.log(`  Archive chunks: ${totalChunks} x ${formatBytes(CHUNK_SIZE)}`);

    const { data: initData } = await api.post(`/sessions/${sid}/chunks/init/`, {
      filename: file.name,
      total_size: totalSize,
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
    });

    const uploadId = initData.upload_id;
    let uploadedBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (abortRef.current) throw new Error("Cancelled");

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = file.slice(start, end);

      await api.put(
        `/sessions/${sid}/chunks/${uploadId}/${i}/`,
        chunk,
        { headers: { "Content-Type": "application/octet-stream" } }
      );

      uploadedBytes += chunk.size;
      onChunkProgress?.(uploadedBytes, totalSize);
    }

    await api.post(`/sessions/${sid}/chunks/${uploadId}/complete/`);
    console.log(`  Archive upload complete: ${file.name}`);
  };

  // Main upload
  const startUpload = useCallback(async (files, scanType = "sumiskai") => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    
    // Validate files
    const { valid: validFiles, skipped, errors } = validateFiles(fileList);
    
    // Store skipped files to show warning
    setSkippedFiles(skipped);
    setValidationErrors(errors);

    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} files:`, skipped);
    }

    // If there are critical errors, stop
    if (errors.length > 0) {
      console.error("Validation errors:", errors);
      const errorMsg = errors.join("\n");
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    // If no valid files, show error and return
    if (validFiles.length === 0) {
      const msg = "Nėra tinkamų failų įkėlimui";
      setError(msg);
      onError?.(msg);
      return;
    }

    const totalBytes = validFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    setIsUploading(true);
    setError(null);
    setUploadProgress({
      current: 0,
      total: validFiles.length,
      bytes: 0,
      totalBytes,
      phase: "uploading",
      currentFile: validFiles[0]?.name || "",
    });
    abortRef.current = false;

    let globalUploadedBytes = 0;
    let uploadedFilesCount = 0;

    try {
      // 1. Create session
      console.log("=== UPLOAD SESSION START ===");
      const { data: session } = await api.post("/sessions/create/", {
        scan_type: scanType,
        client_total_files: validFiles.length,
      });
      console.log(`Session created: ${session.id}`);

      const sid = session.id;

      // 2. Separate files
      const archives = [];
      const regularFiles = [];

      for (const f of validFiles) {
        if (isArchive(f.name)) {
          archives.push(f);
        } else {
          regularFiles.push(f);
        }
      }

      // 3. Split regular files into batches
      const batches = splitIntoBatches(regularFiles);

      console.log(`Total valid files: ${validFiles.length}`);
      console.log(`  Regular files: ${regularFiles.length}`);
      console.log(`  Archives: ${archives.length}`);
      console.log(`  Total size: ${formatBytes(totalBytes)}`);
      console.log(`  Batches: ${batches.length} (max ${MAX_BATCH_FILES} files or ${formatBytes(MAX_BATCH_BYTES)} per batch)`);

      // 4. Upload batches
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        if (abortRef.current) throw new Error("Cancelled");

        const batch = batches[batchIdx];
        const batchBytes = batch.reduce((sum, f) => sum + (f.size || 0), 0);

        console.log(`Uploading batch ${batchIdx + 1}/${batches.length}: ${batch.length} files, ${formatBytes(batchBytes)}`);

        const formData = new FormData();
        batch.forEach(f => formData.append("files", f));

        setUploadProgress(prev => ({
          ...prev,
          currentFile: batch[0]?.name || "",
        }));

        await api.post(`/sessions/${sid}/upload/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.lengthComputable) {
              const batchProgress = progressEvent.loaded;
              setUploadProgress(prev => ({
                ...prev,
                bytes: globalUploadedBytes + batchProgress,
              }));
            }
          },
        });

        globalUploadedBytes += batchBytes;
        uploadedFilesCount += batch.length;

        console.log(`  Batch ${batchIdx + 1} complete. Total uploaded: ${formatBytes(globalUploadedBytes)}`);

        setUploadProgress(prev => ({
          ...prev,
          current: uploadedFilesCount,
          bytes: globalUploadedBytes,
        }));
      }

      // 5. Upload archives
      for (const archive of archives) {
        if (abortRef.current) throw new Error("Cancelled");

        console.log(`Uploading archive: ${archive.name}, ${formatBytes(archive.size)}`);

        setUploadProgress(prev => ({
          ...prev,
          currentFile: archive.name,
        }));

        const archiveStartBytes = globalUploadedBytes;

        await uploadArchiveChunked(sid, archive, (chunkBytes) => {
          setUploadProgress(prev => ({
            ...prev,
            bytes: archiveStartBytes + chunkBytes,
          }));
        });

        globalUploadedBytes += archive.size;
        uploadedFilesCount += 1;

        setUploadProgress(prev => ({
          ...prev,
          current: uploadedFilesCount,
          bytes: globalUploadedBytes,
        }));
      }

      // 6. Finalize
      console.log("Finalizing session...");
      setUploadProgress(prev => ({
        ...prev,
        phase: "finalizing",
        currentFile: "",
      }));

      const { data: finalized } = await api.post(`/sessions/${sid}/finalize/`);
      console.log(`Session finalized: stage=${finalized.stage}, expected_items=${finalized.expected_items}`);
      console.log("=== UPLOAD SESSION END ===");

      if (finalized.stage === "blocked") {
        setError(finalized.error_message || "Nepakanka kreditų");
        onError?.(finalized.error_message);
      } else {
        onUploadComplete?.(finalized);
      }

    } catch (e) {
      console.error("Upload error:", e);
      const msg = e?.response?.data?.error || e.message || "Įkėlimo klaida";
      setError(msg);
      onError?.(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0, bytes: 0, totalBytes: 0, phase: "uploading", currentFile: "" });
    }
  }, [onUploadComplete, onError]);

  const cancelUpload = useCallback(() => {
    abortRef.current = true;
    setIsUploading(false);
  }, []);

  return {
    isUploading,
    uploadProgress,
    error,
    skippedFiles,
    validationErrors,
    clearSkipped,
    clearValidationErrors,
    startUpload,
    cancelUpload,
  };
}

// Экспортируем лимиты для использования в UI
export const UPLOAD_LIMITS = {
  MAX_SINGLE_FILE_BYTES,
  MAX_SINGLE_ARCHIVE_BYTES,
  MAX_TOTAL_FILES,
  MAX_TOTAL_BYTES,
  MAX_ARCHIVES_PER_UPLOAD,
  MAX_ARCHIVES_IN_MIX,
  formatBytes,
};




// // src/components/useUploadSession.jsx

// import { useState, useCallback, useRef } from "react";
// import { api } from "../api/endpoints";

// const MAX_BATCH_FILES = 50;
// const MAX_BATCH_BYTES = 250 * 1024 * 1024; // 250MB
// const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB для архивов

// const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50MB для не-архивов

// const ARCHIVE_EXTS = [
//   ".zip",
//   ".rar",
//   ".7z",
//   ".tar",
//   ".tgz",
//   ".tar.gz",
//   ".tar.bz2",
//   ".tar.xz",
//   ".tbz2",
// ];

// const IMAGE_EXTS = [
//   ".png",
//   ".jpg",
//   ".jpeg",
//   ".jpe",
//   ".webp",
//   ".bmp",
//   ".tif",
//   ".tiff",
//   ".heic",
//   ".heif",
//   ".hif",
//   ".heifs",
//   ".avif",
// ];

// const OFFICE_EXTS = [".doc", ".docx", ".xls", ".xlsx"];
// const HTML_EXTS = [".html", ".htm"];

// const SUPPORTED_EXTS = [
//   ".pdf",
//   ...IMAGE_EXTS,
//   ...OFFICE_EXTS,
//   ...HTML_EXTS,
//   ...ARCHIVE_EXTS,
// ];

// const getFileExt = (filename) => {
//   const lower = (filename || "").toLowerCase();
//   // Handle double extensions like .tar.gz
//   if (lower.endsWith(".tar.gz")) return ".tar.gz";
//   if (lower.endsWith(".tar.bz2")) return ".tar.bz2";
//   if (lower.endsWith(".tar.xz")) return ".tar.xz";
//   const match = lower.match(/\.[^.]+$/);
//   return match ? match[0] : "";
// };

// const isArchive = (filename) => {
//   const ext = getFileExt(filename);
//   return ARCHIVE_EXTS.includes(ext);
// };

// const isSupportedFormat = (filename) => {
//   const ext = getFileExt(filename);
//   return SUPPORTED_EXTS.includes(ext);
// };

// function formatBytes(bytes) {
//   if (bytes === 0) return "0 B";
//   const k = 1024;
//   const sizes = ["B", "KB", "MB", "GB"];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
// }

// // Validate files and separate into valid and skipped
// function validateFiles(files) {
//   const valid = [];
//   const skipped = [];

//   for (const file of files) {
//     const filename = file.name || "";
//     const size = file.size || 0;

//     // Check format
//     if (!isSupportedFormat(filename)) {
//       skipped.push({
//         name: filename,
//         reason: "nepalaikomas formatas",
//       });
//       continue;
//     }

//     // Check size (only for non-archives)
//     if (!isArchive(filename) && size > MAX_SINGLE_FILE_BYTES) {
//       skipped.push({
//         name: filename,
//         reason: `per didelis (${formatBytes(size)})`,
//       });
//       continue;
//     }

//     valid.push(file);
//   }

//   return { valid, skipped };
// }

// // Умное разделение на батчи по количеству И размеру
// function splitIntoBatches(files) {
//   const batches = [];
//   let currentBatch = [];
//   let currentBytes = 0;

//   for (const file of files) {
//     const fileSize = file.size || 0;

//     // Если добавление файла превысит лимиты — начинаем новый батч
//     if (
//       currentBatch.length >= MAX_BATCH_FILES ||
//       (currentBytes + fileSize > MAX_BATCH_BYTES && currentBatch.length > 0)
//     ) {
//       batches.push(currentBatch);
//       currentBatch = [];
//       currentBytes = 0;
//     }

//     currentBatch.push(file);
//     currentBytes += fileSize;
//   }

//   if (currentBatch.length > 0) {
//     batches.push(currentBatch);
//   }

//   return batches;
// }

// export function useUploadSession({ onUploadComplete, onError }) {
//   const [isUploading, setIsUploading] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState({
//     current: 0,
//     total: 0,
//     bytes: 0,
//     totalBytes: 0,
//     phase: "uploading",
//     currentFile: "",
//   });
//   const [error, setError] = useState(null);
//   const [skippedFiles, setSkippedFiles] = useState([]);
//   const abortRef = useRef(false);

//   const clearSkipped = useCallback(() => {
//     setSkippedFiles([]);
//   }, []);

//   // Upload archive chunked
//   const uploadArchiveChunked = async (sid, file, onChunkProgress) => {
//     const totalSize = file.size;
//     const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

//     console.log(`  Archive chunks: ${totalChunks} x ${formatBytes(CHUNK_SIZE)}`);

//     const { data: initData } = await api.post(`/sessions/${sid}/chunks/init/`, {
//       filename: file.name,
//       total_size: totalSize,
//       chunk_size: CHUNK_SIZE,
//       total_chunks: totalChunks,
//     });

//     const uploadId = initData.upload_id;
//     let uploadedBytes = 0;

//     for (let i = 0; i < totalChunks; i++) {
//       if (abortRef.current) throw new Error("Cancelled");

//       const start = i * CHUNK_SIZE;
//       const end = Math.min(start + CHUNK_SIZE, totalSize);
//       const chunk = file.slice(start, end);

//       await api.put(
//         `/sessions/${sid}/chunks/${uploadId}/${i}/`,
//         chunk,
//         { headers: { "Content-Type": "application/octet-stream" } }
//       );

//       uploadedBytes += chunk.size;
//       onChunkProgress?.(uploadedBytes, totalSize);
//     }

//     await api.post(`/sessions/${sid}/chunks/${uploadId}/complete/`);
//     console.log(`  Archive upload complete: ${file.name}`);
//   };

//   // Main upload
//   const startUpload = useCallback(async (files, scanType = "sumiskai") => {
//     if (!files || files.length === 0) return;

//     const fileList = Array.from(files);
    
//     // Validate files
//     const { valid: validFiles, skipped } = validateFiles(fileList);
    
//     // Store skipped files to show warning later
//     setSkippedFiles(skipped);

//     if (skipped.length > 0) {
//       console.log(`Skipped ${skipped.length} files:`, skipped);
//     }

//     // If no valid files, show error and return
//     if (validFiles.length === 0) {
//       const msg = "Nėra tinkamų failų įkėlimui";
//       setError(msg);
//       onError?.(msg);
//       return;
//     }

//     const totalBytes = validFiles.reduce((sum, f) => sum + (f.size || 0), 0);

//     setIsUploading(true);
//     setError(null);
//     setUploadProgress({
//       current: 0,
//       total: validFiles.length,
//       bytes: 0,
//       totalBytes,
//       phase: "uploading",
//       currentFile: validFiles[0]?.name || "",
//     });
//     abortRef.current = false;

//     let globalUploadedBytes = 0;
//     let uploadedFilesCount = 0;

//     try {
//       // 1. Create session
//       console.log("=== UPLOAD SESSION START ===");
//       const { data: session } = await api.post("/sessions/create/", {
//         scan_type: scanType,
//         client_total_files: validFiles.length,
//       });
//       console.log(`Session created: ${session.id}`);

//       const sid = session.id;

//       // 2. Separate files
//       const archives = [];
//       const regularFiles = [];

//       for (const f of validFiles) {
//         if (isArchive(f.name)) {
//           archives.push(f);
//         } else {
//           regularFiles.push(f);
//         }
//       }

//       // 3. Split regular files into batches
//       const batches = splitIntoBatches(regularFiles);

//       console.log(`Total valid files: ${validFiles.length}`);
//       console.log(`  Regular files: ${regularFiles.length}`);
//       console.log(`  Archives: ${archives.length}`);
//       console.log(`  Total size: ${formatBytes(totalBytes)}`);
//       console.log(`  Batches: ${batches.length} (max ${MAX_BATCH_FILES} files or ${formatBytes(MAX_BATCH_BYTES)} per batch)`);

//       // 4. Upload batches
//       for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
//         if (abortRef.current) throw new Error("Cancelled");

//         const batch = batches[batchIdx];
//         const batchBytes = batch.reduce((sum, f) => sum + (f.size || 0), 0);

//         console.log(`Uploading batch ${batchIdx + 1}/${batches.length}: ${batch.length} files, ${formatBytes(batchBytes)}`);

//         const formData = new FormData();
//         batch.forEach(f => formData.append("files", f));

//         setUploadProgress(prev => ({
//           ...prev,
//           currentFile: batch[0]?.name || "",
//         }));

//         await api.post(`/sessions/${sid}/upload/`, formData, {
//           headers: { "Content-Type": "multipart/form-data" },
//           onUploadProgress: (progressEvent) => {
//             if (progressEvent.lengthComputable) {
//               const batchProgress = progressEvent.loaded;
//               setUploadProgress(prev => ({
//                 ...prev,
//                 bytes: globalUploadedBytes + batchProgress,
//               }));
//             }
//           },
//         });

//         globalUploadedBytes += batchBytes;
//         uploadedFilesCount += batch.length;

//         console.log(`  Batch ${batchIdx + 1} complete. Total uploaded: ${formatBytes(globalUploadedBytes)}`);

//         setUploadProgress(prev => ({
//           ...prev,
//           current: uploadedFilesCount,
//           bytes: globalUploadedBytes,
//         }));
//       }

//       // 5. Upload archives
//       for (const archive of archives) {
//         if (abortRef.current) throw new Error("Cancelled");

//         console.log(`Uploading archive: ${archive.name}, ${formatBytes(archive.size)}`);

//         setUploadProgress(prev => ({
//           ...prev,
//           currentFile: archive.name,
//         }));

//         const archiveStartBytes = globalUploadedBytes;

//         await uploadArchiveChunked(sid, archive, (chunkBytes) => {
//           setUploadProgress(prev => ({
//             ...prev,
//             bytes: archiveStartBytes + chunkBytes,
//           }));
//         });

//         globalUploadedBytes += archive.size;
//         uploadedFilesCount += 1;

//         setUploadProgress(prev => ({
//           ...prev,
//           current: uploadedFilesCount,
//           bytes: globalUploadedBytes,
//         }));
//       }

//       // 6. Finalize
//       console.log("Finalizing session...");
//       setUploadProgress(prev => ({
//         ...prev,
//         phase: "finalizing",
//         currentFile: "",
//       }));

//       const { data: finalized } = await api.post(`/sessions/${sid}/finalize/`);
//       console.log(`Session finalized: stage=${finalized.stage}, expected_items=${finalized.expected_items}`);
//       console.log("=== UPLOAD SESSION END ===");

//       if (finalized.stage === "blocked") {
//         setError(finalized.error_message || "Nepakanka kreditų");
//         onError?.(finalized.error_message);
//       } else {
//         onUploadComplete?.(finalized);
//       }

//     } catch (e) {
//       console.error("Upload error:", e);
//       const msg = e?.response?.data?.error || e.message || "Įkėlimo klaida";
//       setError(msg);
//       onError?.(msg);
//     } finally {
//       setIsUploading(false);
//       setUploadProgress({ current: 0, total: 0, bytes: 0, totalBytes: 0, phase: "uploading", currentFile: "" });
//     }
//   }, [onUploadComplete, onError]);

//   const cancelUpload = useCallback(() => {
//     abortRef.current = true;
//     setIsUploading(false);
//   }, []);

//   return {
//     isUploading,
//     uploadProgress,
//     error,
//     skippedFiles,
//     clearSkipped,
//     startUpload,
//     cancelUpload,
//   };
// }