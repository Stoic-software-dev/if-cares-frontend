import { randomUUID } from 'node:crypto';

// A consolidated claim reads every count of a month across every site and then
// renders a PDF. That is a minute or more of work, which is longer than any
// hosting platform will hold a request open. So the request starts the work and
// answers with an id, and the screen polls until it is done.
//
// The registry lives in the server process. That is the right size for this: the
// app runs as one long lived Node server, a job is finished within minutes, and
// the finished document is persisted to Drive and recorded in GeneratedReport,
// which is what has to survive. A restart mid job loses the job, not the data,
// and the screen says so instead of spinning forever.

const TTL_MS = 30 * 60 * 1000;
const jobs = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > TTL_MS) jobs.delete(id);
  }
}

/**
 * Runs `work` in the background and returns the id to poll.
 * `work` receives a progress reporter so a long job can say where it is.
 */
export function startJob({ kind, label, work }) {
  sweep();
  const id = randomUUID();
  const job = {
    id,
    kind,
    label,
    status: 'processing',
    progress: '',
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    error: '',
  };
  jobs.set(id, job);

  const report = (message) => {
    job.progress = String(message ?? '').slice(0, 200);
  };

  // Deliberately not awaited: the request that started it is already answering.
  Promise.resolve()
    .then(() => work(report))
    .then((result) => {
      job.status = 'completed';
      job.result = result ?? null;
      job.finishedAt = Date.now();
    })
    .catch((error) => {
      job.status = 'error';
      job.error = error?.message || 'The report could not be built.';
      job.finishedAt = Date.now();
    });

  return id;
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    progress: job.progress,
    error: job.error,
    elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt,
    result: job.result,
  };
}

/** Everything still running or recently finished, newest first. */
export function listJobs() {
  sweep();
  return [...jobs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((job) => getJob(job.id));
}

export function cancelJob(id) {
  const job = jobs.get(id);
  // The work itself cannot be interrupted, but a cancelled job stops being
  // waited on and stops occupying the screen.
  if (job && job.status === 'processing') {
    job.status = 'error';
    job.error = 'Cancelled.';
    job.finishedAt = Date.now();
    return true;
  }
  return false;
}
