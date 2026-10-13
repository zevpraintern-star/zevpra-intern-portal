"use client";

import { FileUp, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { FieldError } from "@/components/forms/action-form";
import { Label } from "@/components/ui/label";

interface Uploaded { id: string; name: string; size: number }

/**
 * Uploads each chosen file to /api/uploads (which re-validates type, size and content
 * on the server) and submits only the returned file ids with the form.
 */
export function FileField({
  label, name, purpose, accept = "image/png,image/jpeg,image/webp,application/pdf", multiple = false, required = false, hint,
}: {
  label: string; name: string; purpose: string; accept?: string; multiple?: boolean; required?: boolean; hint?: string;
}) {
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const added: Uploaded[] = [];
      for (const file of Array.from(list)) {
        const body = new FormData();
        body.set("file", file);
        body.set("purpose", purpose);
        const response = await fetch("/api/uploads", { method: "POST", body });
        const json = await response.json();
        if (!json.success) throw new Error(json.error?.message ?? "Upload failed.");
        added.push({ id: json.data.fileId, name: json.data.name, size: json.data.size });
      }
      setFiles((current) => (multiple ? [...current, ...added] : added));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <Label htmlFor={`${name}-picker`}>{label}{required ? <span aria-hidden="true"> *</span> : null}</Label>
      <div className="mt-1.5 rounded-lg border border-dashed border-input p-4">
        <input ref={input} id={`${name}-picker`} type="file" accept={accept} multiple={multiple} onChange={(e) => onPick(e.target.files)} className="sr-only" />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
          {busy ? "Uploading…" : multiple ? "Choose files" : "Choose a file"}
        </button>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((x) => x.id !== f.id))}>
                <X className="size-4 text-muted-foreground hover:text-foreground" />
              </button>
              <input type="hidden" name={name} value={f.id} />
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <FieldError name={name} />
    </div>
  );
}
