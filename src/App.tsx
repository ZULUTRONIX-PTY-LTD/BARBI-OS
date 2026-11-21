import { useEffect } from 'react';
import { BarbiWorkspace } from './barbi/BarbiWorkspace';
import { BarbiChatPanel } from './components/BarbiChatPanel';
import { BarbiV4Hub } from './components/BarbiV4Hub';
import { GodsEyeViewport } from './components/GodsEyeViewport';
import { FileSystemAgentPanel } from './components/FileSystemAgentPanel';
import { GestureNavHud } from './components/GestureNavHud';
import { SphereConfigPanel } from './components/SphereConfigPanel';
import { PWAInstallAndSyncBadge } from './pwa/PWAInstallUI';
import { installUiPerceptionGlobal } from './voice/barbiUiPerception';

export default function App() {
  useEffect(() => {
    installUiPerceptionGlobal();
  }, []);

  return (
    <>
      <BarbiWorkspace />
      <BarbiChatPanel />
      <BarbiV4Hub />
      <GodsEyeViewport />
      <FileSystemAgentPanel />
      <GestureNavHud />
      <SphereConfigPanel />
      <PWAInstallAndSyncBadge />
    </>
  );
}
