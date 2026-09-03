"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface UploadZoneProps {
  accept?: string;
  maxSizeMB?: number;
  onFileSelect?: (file: File) => void;
  className?: string;
}

/**
 * A drag-and-drop file upload zone.
 * Visual-only shell — actual upload handling is implemented by the parent.
 */
export function UploadZone({
  accept = ".pdf,.docx",
  maxSizeMB = 5,
  onFileSelect,
  className,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        onFileSelect?.(file);
      }
    },
    [onFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        onFileSelect?.(file);
      }
    },
    [onFileSelect]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-12 transition-all",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/50"
        )}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="sr-only"
        />
        <div
          className={cn(
            "mb-4 flex size-14 items-center justify-center rounded-2xl transition-colors",
            isDragging ? "bg-primary/15" : "bg-primary/8"
          )}
        >
          <Upload className="size-6 text-primary" />
        </div>
        <p className="mb-1 text-sm font-semibold text-foreground">
          {isDragging ? "Drop your file here" : "Drag & drop your resume"}
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          or click to browse &middot; PDF, DOCX &middot; Max {maxSizeMB} MB
        </p>
        <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none")}>
          Choose File
        </span>
      </label>

      {selectedFile && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <FileText className="size-5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {selectedFile.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={clearFile}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Remove file"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
