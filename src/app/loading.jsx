import { Skeleton } from '@/components/ui/skeleton';

// Shown the moment a navigation starts, so moving between sections paints
// immediately instead of holding the previous screen. It takes the shape of the
// app frame: bar, toolbar, content.
export default function Loading() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="h-14 border-b border-border bg-card md:h-[60px]" />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 pt-5 md:px-8 md:pt-7">
        <Skeleton className="h-[68px] w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    </div>
  );
}
