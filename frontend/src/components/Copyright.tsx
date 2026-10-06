export default function Copyright({
  className = "",
  loading = false,
}: {
  className?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-0.5">
        <div className="h-2.5 w-48 bg-slate-200/80 dark:bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <p className={className}>
      &copy; {new Date().getFullYear()} MTPL. All rights reserved.
    </p>
  );
}
