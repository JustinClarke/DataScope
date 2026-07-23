import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { UploadCloud } from 'lucide-react';
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
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50 border-(--color-border)'
          : isDragActive
            ? 'cursor-pointer border-(--color-accent) bg-(--color-border)'
            : 'cursor-pointer border-(--color-border) hover:border-(--color-accent)'
      }`}
    >
      <UploadCloud size={32} className="text-(--color-fg-muted)" aria-hidden="true" />
      <p className="text-(--color-fg)">Drop files, a folder, or a ZIP archive here</p>
      <p className="text-sm text-(--color-fg-muted)">
        CSV, TSV, Parquet, or JSON/JSONL — or click to browse,{' '}
        <button
          type="button"
          disabled={disabled}
          onClick={openFolderPicker}
          className="underline underline-offset-2 hover:text-(--color-fg) disabled:cursor-not-allowed"
        >
          choose a folder
        </button>
      </p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".csv,.tsv,.parquet,.json,.jsonl,.ndjson,.zip"
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
