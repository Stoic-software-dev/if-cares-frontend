'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { SiteSwitcher } from '@/components/shell/SiteSwitcher';
import RosterManager from '@/components/sites/RosterManager';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet } from '@/lib/api-client';
import { SITES_PATH, useCachedGet } from '@/lib/data-cache';
import { useStoredState } from '@/lib/hooks';
import { sortSiteNames } from '@/lib/sites';

// The same key the dashboard remembers its site under: someone who files for
// one site all day should land on that site's roster without picking it again.
const SITE_STORAGE_KEY = 'ifc.selectedSite';

// The old app opened on the roster and let every site keep its own list. The
// redesign moved it under the administrator's site page, and the sites were
// left with no way to add a new child or take one off - which is the list their
// meal counts are taken against.
function RosterScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteFromUrl = searchParams.get('site');
  const { user } = useAuth();

  const ownSites = assignedSiteNames(user);
  const siteList = useCachedGet(SITES_PATH, { enabled: !ownSites });

  const [selectedSite, setSelectedSite] = useState('');
  const [storedSite, setStoredSite, storedSiteReady] = useStoredState(SITE_STORAGE_KEY, '');
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');
  const siteRef = useRef('');
  siteRef.current = selectedSite;

  const sites = useMemo(() => {
    if (ownSites) return sortSiteNames(ownSites);
    if (!siteList.data) return null;
    return sortSiteNames(siteList.data.map((site) => site.name));
  }, [ownSites, siteList.data]);

  useEffect(() => {
    if (!sites || sites.length === 0 || !storedSiteReady) return;
    setSelectedSite((current) => {
      if (current && sites.includes(current)) return current;
      if (siteFromUrl && sites.includes(siteFromUrl)) return siteFromUrl;
      if (storedSite && sites.includes(storedSite)) return storedSite;
      return sites[0];
    });
  }, [sites, siteFromUrl, storedSite, storedSiteReady]);

  const loadRoster = useCallback(() => {
    if (!selectedSite) return Promise.resolve();
    setError('');
    return apiGet(`/api/students/roster?site=${encodeURIComponent(selectedSite)}`)
      .then((list) => {
        // A slow answer for the site just left must not paint over this one.
        if (siteRef.current === selectedSite) setRoster(list);
      })
      .catch((err) => setError(err.message));
  }, [selectedSite]);

  useEffect(() => {
    setRoster(null);
    loadRoster();
  }, [loadRoster]);

  const pickSite = (name) => {
    setSelectedSite(name);
    setStoredSite(name);
    const query = new URLSearchParams(searchParams.toString());
    query.set('site', name);
    router.replace(`/roster?${query.toString()}`, { scroll: false });
  };

  if (siteList.error) {
    return (
      <AppShell>
        <ErrorState title="Couldn't load your sites" message={siteList.error} onRetry={siteList.refresh} />
      </AppShell>
    );
  }

  if (sites && sites.length === 0) {
    return (
      <AppShell>
        <div className="rounded-lg border border-dashed border-border-strong bg-card">
          <EmptyState
            icon={Building2}
            title="No site is assigned to your account"
            description="An administrator assigns the sites you work at. Until then there is no roster to keep."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Roster"
          subtitle={
            roster ? `${roster.length} ${roster.length === 1 ? 'student' : 'students'}` : 'The students you count meals for'
          }
        />

        {!sites || !selectedSite ? (
          <Skeleton className="h-12 w-full rounded-md md:h-11" />
        ) : (
          <SiteSwitcher sites={sites} value={selectedSite} onChange={pickSite} className="sm:max-w-md" />
        )}

        {error ? (
          <ErrorState title="Couldn't load the roster" message={error} onRetry={loadRoster} />
        ) : (
          selectedSite && <RosterManager site={selectedSite} roster={roster} onChanged={loadRoster} />
        )}
      </div>
    </AppShell>
  );
}

export default function RosterPage() {
  return (
    <Protected>
      <Suspense fallback={null}>
        <RosterScreen />
      </Suspense>
    </Protected>
  );
}
