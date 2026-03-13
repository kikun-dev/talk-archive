import { Skeleton } from "@/components/Skeleton";

export default function SearchLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-16" />

      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-10 flex-1 rounded" />
        <Skeleton className="h-10 w-16 rounded" />
      </div>
    </div>
  );
}
