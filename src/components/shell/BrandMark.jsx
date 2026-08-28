import Image from 'next/image';
import { cn } from '@/lib/utils';

// The official IF Cares wordmark (public/web-logo.png). The artwork is dark
// ink on transparent, so in dark mode it is inverted to read as white rather
// than disappearing into the surface.
export default function BrandMark({ size = 'sm', className }) {
  return (
    <Image
      src="/web-logo.png"
      alt="IF Cares, Intrinsic Foundation"
      width={1000}
      height={400}
      priority
      className={cn(
        // self-start keeps stretch-aligned flex parents from distorting it.
        'self-start object-contain dark:brightness-0 dark:invert',
        size === 'lg' ? 'h-14 w-auto' : size === 'md' ? 'h-10 w-auto' : 'h-8 w-auto',
        className
      )}
    />
  );
}
