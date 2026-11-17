import { runScan } from './signalScanner';
import { getGlobalScanStatus, updateScanState } from './globalSignalScanner';

let isScanRunning = false;

export async function triggerScan(): Promise<{ triggered: boolean; running: boolean; message: string }> {
  if (isScanRunning) {
    console.log('Scan is already in progress. Skipping this trigger.');
    return {
      triggered: false,
      running: true,
      message: 'Scan is already in progress.',
    };
  }

  isScanRunning = true;
  updateScanState({ running: true, lastError: null });

  try {
    await runScan();
    updateScanState({ running: false, lastCompletedAt: new Date().toISOString() });
    return {
      triggered: true,
      running: false,
      message: 'Scan completed.',
    };
  } catch (error: any) {
    console.error('An unexpected error occurred during the scan execution:', error);
    updateScanState({ running: false, lastError: error?.message || String(error) });
    return {
      triggered: true,
      running: false,
      message: error?.message || 'Scan failed.',
    };
  } finally {
    isScanRunning = false;
  }
}

export function triggerScanAsync(): { triggered: boolean; running: boolean; message: string } {
  if (isScanRunning) {
    return {
      triggered: false,
      running: true,
      message: 'Scan is already in progress.',
    };
  }
  void triggerScan();
  return {
    triggered: true,
    running: true,
    message: 'Manual scan started.',
  };
}

export function isCronScanRunning(): boolean {
  return isScanRunning || getGlobalScanStatus().running;
}

export function startCron(): void {
  console.log('Starting cron service. Initial scan will run now.');
  void triggerScan();

  setInterval(() => {
    void triggerScan();
  }, 60 * 1000);

  console.log('Cron job scheduled to run every 1 minute.');
}
