export async function logErrorMonitoring({ function_name, error, row_error }) {
  const payload = {
    client: 'ifcares - regular web app',
    function_name,
    error: error?.message || String(error),
    developer: 'Juan',
    row_error: row_error || error?.stack || 'Unknown line',
    url_file: 'https://github.com/Set-Forget/ifcares',
    url_front: 'https://ifcares.vercel.app/ (el deploy creo que esta en la cuenta de vercel de ivo)',
  };
  try {
    await fetch('https://monitoring-center-production.up.railway.app/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (logErr) {
    console.error(':x: Error logging to monitoring service:', logErr.message);
  }
}
