export default function Copyright({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      &copy; {new Date().getFullYear()} MTPL. All rights reserved.
    </p>
  );
}
