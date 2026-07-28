import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { collectFilesFromDataTransfer } from './folderTraversal';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/** Drop zone for one or more files, a dropped folder, a ZIP, or click-to-browse (single/multi-select + folder picker). */
export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const openFilePicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const openFolderPicker = (event: MouseEvent) => {
    event.stopPropagation();
    if (!disabled) folderInputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (disabled) return;
    // Folder entries only resolve async (webkitGetAsEntry), so the collected
    // files can't be read synchronously off the drop event itself.
    void collectFilesFromDataTransfer(event.dataTransfer).then((files) => {
      if (files.length > 0) onFiles(files);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={openFilePicker}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      className={`group relative flex min-h-28 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed px-6 py-6 text-center transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed border-(--color-rule) opacity-50'
          : isDragActive
            ? 'cursor-pointer border-solid border-(--color-active) bg-(--color-active)/5'
            : 'cursor-pointer border-(--color-rule) hover:border-(--color-active)/40 hover:bg-(--color-elev)/30'
      }`}
    >
      {/* Upload icon */}
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
        isDragActive
          ? 'bg-(--color-active)/15 text-(--color-active)'
          : 'bg-(--color-elev) text-(--color-ink-3) group-hover:bg-(--color-active)/10 group-hover:text-(--color-active)'
      }`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div>
        <p className={`text-[length:var(--text-base)] font-medium transition-colors ${
          isDragActive ? 'text-(--color-active)' : 'text-(--color-ink)'
        }`}>
          {isDragActive ? 'Drop to analyse' : 'Drop files, a folder, or a ZIP'}
        </p>
        <p className="mt-1 text-[length:var(--text-sm)] text-(--color-ink-3)">
          CSV, TSV, Parquet, JSON/JSONL — or click to browse,{' '}
          <button
            type="button"
            disabled={disabled}
            onClick={openFolderPicker}
            className="underline underline-offset-2 transition-colors hover:text-(--color-ink) disabled:cursor-not-allowed"
          >
            choose a folder
          </button>
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".csv,.tsv,.parquet,.json,.jsonl,.ndjson,.zip,.dsps"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error -- webkitdirectory has no JSX typing; it's a real, widely-supported non-standard attribute (see lib.dom.d.ts's HTMLInputElement.webkitdirectory).
        webkitdirectory=""
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
