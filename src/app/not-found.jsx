import Link from 'next/link';
import { Compass } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark size="lg" className="self-center" />
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Compass className="h-6 w-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">This page does not exist</h1>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          The link may be out of date. The dashboard has every site you can open.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Go to the dashboard</Link>
      </Button>
    </main>
  );
}
