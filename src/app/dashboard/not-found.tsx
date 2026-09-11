import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>
        Sahifa topilmadi
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Manzil noto&apos;g&apos;ri yoki bu sahifaga ruxsatingiz yo&apos;q.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: "var(--cobalt)" }}>
        Bosh sahifaga
      </Link>
    </div>
  );
}
