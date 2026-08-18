import Image from 'next/image';
import { cn } from '@/lib/utils';

// The official IF Cares wordmark (public/web-logo.png).
export default function BrandMark({ size = 'sm', className }) {
  return (
    <Image
      src="/web-logo.png"
      alt="IF Cares — Intrinsic Foundation"
      width={1000}
      height={400}
      priority
      className={cn(size === 'lg' ? 'h-16 w-auto' : 'h-8 w-auto', className)}
    />
  );
}
