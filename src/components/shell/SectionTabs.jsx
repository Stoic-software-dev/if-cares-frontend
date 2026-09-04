'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Segmented } from '@/components/ui/segmented';

// Two routes, one subject. A holiday is a property of the sites it closes -
// which sites, and on what day - so it lives with them rather than as an entry
// of its own in the navigation. As tabs, the question is just "which half am I
// looking at".
export function SectionTabs({ options, ariaLabel }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = options.find((option) => pathname.startsWith(option.value))?.value ?? options[0].value;

  return (
    <Segmented
      ariaLabel={ariaLabel}
      value={current}
      onChange={(next) => next !== current && router.push(next)}
      options={options}
      // `w-auto` alone loses to the column's stretch, so the strip spanned the
      // whole screen for the sake of two tabs.
      className="sm:w-auto sm:self-start"
    />
  );
}

export const SITES_TABS = [
  { value: '/admin/sites', label: 'Sites' },
  { value: '/admin/holidays', label: 'Holidays' },
];
