import { Skeleton } from "@/components/Skeleton";

export default function ConversationLoading() {
  return (
    <div className="-m-4 flex h-full flex-col bg-gray-100 sm:-m-6">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-4 py-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-5" />
      </div>

      {/* Timeline */}
      <div className="flex-1 space-y-4 overflow-hidden px-4 py-4">
        {/* Date header */}
        <div className="flex justify-center">
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>

        {/* Messages - alternating left/right */}
        <div className="flex items-start gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-48 rounded-lg" />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-20 w-56 rounded-lg" />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-center">
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>

        <div className="flex items-start gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-18" />
            <Skeleton className="h-14 w-52 rounded-lg" />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-gray-300 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 rounded" />
          <Skeleton className="h-10 w-16 rounded" />
        </div>
      </div>
    </div>
  );
}
