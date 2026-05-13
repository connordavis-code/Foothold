import { Skeleton } from '@/components/ui/skeleton';

export default function GoalsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <article
            key={i}
            className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-5 sm:p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-3 w-44" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
