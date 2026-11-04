import { FileDown } from "lucide-react";
import { withBase } from "@/lib/basePath";

export function ExcelLink({ href }: { href: string }) {
  return (
    <a
      href={withBase(href)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
    >
      <FileDown className="h-4 w-4" />
      Excel
    </a>
  );
}
