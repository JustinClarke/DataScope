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
      // min-h steps down from V6d's 48 because the drop zone no longer owns the
      // wider of two columns — Act 0's viewport-fit frame makes this panel one
      // column, so 32 keeps the same optical weight against a narrower measure
      // while leaving the URL form and all five samples inside one 800px-tall
      // viewport, which is where a 13" laptop actually lands. Still a 128px
      // target — the page's primary affordance is not in doubt at this size.
      className={`flex min-h-32 flex-col justify-center gap-2 rounded-(--radius-xs) border border-dashed bg-(--color-card) px-6 py-6 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-(--color-rule) opacity-50'
          : isDragActive
            ? 'cursor-pointer border-solid border-(--color-active) bg-(--color-elev)'
            : 'cursor-pointer border-(--color-rule) hover:border-(--color-rule-hi)'
      }`}
    >
      <p className="text-[length:var(--text-lg)] text-(--color-ink)">
        Drop files, a folder, or a ZIP archive here
      </p>
      <p className="text-[length:var(--text-base)] text-(--color-ink-3)">
        CSV, TSV, Parquet, or JSON/JSONL — or click to browse,{' '}
        <button
          type="button"
          disabled={disabled}
          onClick={openFolderPicker}
          className="underline underline-offset-2 hover:text-(--color-ink) disabled:cursor-not-allowed"
        >
          choose a folder
        </button>
      </p>
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
