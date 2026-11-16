import { BarbiWorkspace } from './barbi/BarbiWorkspace';
import { PWAInstallAndSyncBadge } from './pwa/PWAInstallUI';

export default function App() {
  return (
    <>
      <BarbiWorkspace />
      <PWAInstallAndSyncBadge />
    </>
  );
}
