import { useEffect, useState } from 'react';
import { syncPendingOfflineMutations } from '../api/barbiClient';
import { usePWAInstall } from './usePWAInstall';

export function PWAInstallAndSyncBadge() {
  const { isInstalled, canInstallNative, isIOS, isDismissed, install, dismiss } = usePWAInstall();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      void syncPendingOfflineMutations();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div className="fixed bottom-3 right-3.5 z-40 flex items-center gap-1.5 pointer-events-auto">
      {!isOnline && (
        <div
          role="status"
          className="px-2.5 py-1 bg-amber-950/85 border border-amber-500/60 text-amber-200 text-[10px] font-mono-tech uppercase tracking-wider shadow-lg"
        >
          Offline • Local Sync Queued
        </div>
      )}

      {!isInstalled && !isDismissed && (canInstallNative || isIOS) && (
        <div className="flex items-center gap-1 px-2.5 py-1 bg-black/75 border border-amber-500/45 text-amber-200 text-[10px] font-mono-tech shadow-lg">
          {canInstallNative ? (
            <button
              type="button"
              onClick={() => void install()}
              className="hover:text-white transition cursor-pointer"
              title="Install B.A.R.B.I on Windows, macOS, or Android"
            >
              ⬇ Install App
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowIosTip((prev) => !prev)}
              className="hover:text-white transition cursor-pointer"
            >
              ⬇ Add to Home
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="text-slate-400 hover:text-white ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {showIosTip && (
        <div className="absolute bottom-9 right-0 w-60 p-2.5 bg-black/95 border border-amber-500/50 text-[10px] font-mono-tech text-slate-200 shadow-2xl">
          Tap <span className="text-amber-300 font-semibold">Share</span> then{' '}
          <span className="text-amber-300 font-semibold">Add to Home Screen</span> to install B.A.R.B.I.
        </div>
      )}
    </div>
  );
}
