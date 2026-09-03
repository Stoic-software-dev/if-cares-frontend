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
  // `title` is the job title printed beside the signature line. Once signed,
  // `signedTitle` is what the signer actually put there; before that it is the
  // one the claim was built with, which is pre-printed on the blank form and so
  // has to survive a rebuild like everything else the document shows.
  const options = {
    signature: signature || report.signature || '',
    signedBy: signedBy || report.signedBy || '',
    title: title || report.signedTitle || report.title || '',
  };

  // The exclusions are part of what the claim IS, not a detail of how it was
  // requested. Rebuilding without them produced a different document under the
  // same file name - and since the signing page rebuilds, the signature landed
  // on sites the administrator had deliberately left out.
  const input = {
    year: report.year,
    month: report.month,
    state: report.state || undefined,
    excludeSites: report.excludeSites ?? [],
  };

  if (report.kind === 'claim-part2') {
    return buildConsolidatedDaysPdf(await consolidatedByDay(input), options);
  }
  return buildConsolidatedSitesPdf(await consolidatedBySite(input), options);
}
