'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Segmented } from '@/components/ui/segmented';

// Two routes, one subject. The service calendar and the holidays that close it
// were separate entries in the navigation, which asked an administrator to know
// they are separate screens before knowing they are the same job. As tabs, the
// question is just "which half am I looking at".
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
      className="sm:w-auto"
    />
  );
}

export const CALENDAR_TABS = [
  { value: '/admin/calendar', label: 'Service days' },
  { value: '/admin/holidays', label: 'Holidays' },
];
