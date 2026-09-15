"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Bosiladigan jadval qatori: bosilganda `href` ga yumshoq o'tadi (sahifa qayta yuklanmaydi, joy
 * saqlanadi). Ichidagi havola/tugma bosilsa yoki matn belgilansa — o'tmaydi. Klaviatura uchun
 * qatorda alohida havola bo'lishi shart (masalan ▸ belgisi) — `tr` o'zi fokus olmaydi.
 */
export function ClickableRow({
  href,
  expanded,
  className,
  children,
}: {
  href: string;
  expanded: boolean;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <tr
      aria-expanded={expanded}
      className={cn(className, "cursor-pointer transition-colors hover:bg-muted/40", pending && "opacity-60")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        if (window.getSelection()?.toString()) return;
        start(() => router.push(href, { scroll: false }));
      }}
    >
      {children}
    </tr>
  );
}
