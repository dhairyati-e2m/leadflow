import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h2 className="text-2xl font-bold text-obsidian dark:text-cosmic-100 mb-2">Page Not Found</h2>
      <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mb-6">Could not find requested resource</p>
      <Link href="/" className="btn-obsidian px-4 py-2 rounded-xl text-xs font-semibold">
        Return Home
      </Link>
    </div>
  );
}
