const { runScan } = require('./signalScanner');

// A simple in-memory lock to prevent concurrent scans.
let isScanRunning = false;

/**
 * The function that will be called by our cron mechanism.
 */
async function triggerScan() {
  if (isScanRunning) {
    console.log('Scan is already in progress. Skipping this trigger.');
    return;
  }

  isScanRunning = true;
  try {
    await runScan();
  } catch (error) {
    console.error('An unexpected error occurred during the scan execution:', error);
  } finally {
    isScanRunning = false;
  }
}

/**
 * Starts the cron job.
 * For Render's free tier, a simple setInterval is a good starting point.
 * An external uptime service will be used to keep the server awake.
 */
function startCron() {
  // Run a scan immediately on startup.
  console.log('Starting cron service. Initial scan will run now.');
  triggerScan();

  // Then, run a scan every 60 seconds.
  // This interval can be adjusted based on desired signal frequency.
  setInterval(triggerScan, 60 * 1000);

  console.log('Cron job scheduled to run every 60 seconds.');
}

module.exports = {
  startCron,
};
