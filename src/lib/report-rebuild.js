import { consolidatedBySite, consolidatedByDay } from '@/lib/report-data';
import { buildConsolidatedSitesPdf, buildConsolidatedDaysPdf } from '@/lib/report-pdf';

// Rebuilding a stored claim from its record. The counts are the source of truth,
// so a claim can always be produced again: the stored PDF is a convenience, not
// the only copy. It is also how a signature gets onto the document, since the
// signed version is the same report rendered again with the signature block
// filled in.
export async function rebuildReport(report, { signature = '', signedBy = '', title = '' } = {}) {
  // A stored signature is part of the document from then on, so rebuilding a
  // signed claim reproduces the signed claim.
  const options = {
    signature: signature || report.signature || '',
    signedBy: signedBy || report.signedBy || '',
    title: title || report.signedTitle || '',
  };

  const input = {
    year: report.year,
    month: report.month,
    state: report.state || undefined,
    excludeSites: [],
  };

  if (report.kind === 'claim-part2') {
    return buildConsolidatedDaysPdf(await consolidatedByDay(input), options);
  }
  return buildConsolidatedSitesPdf(await consolidatedBySite(input), options);
}
