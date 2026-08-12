import { useEffect, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';

// Subtle connectivity indicator. The vault is local-first (Dexie), so going
// offline never blocks reading or logging -- this just tells the user which
// mode they're in, and that offline changes live on this device until the
// next successful sync.
export function SyncStatusBadge() {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) {
    return (
      <span
        title="Online — changes sync to the family cloud"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-1"
      >
        <Cloud className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Synced</span>
      </span>
    );
  }

  return (
    <span
      title="Offline — everything keeps working from the local vault; changes sync when you're back online"
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-1"
    >
      <CloudOff className="w-3.5 h-3.5" />
      Offline
    </span>
  );
}
