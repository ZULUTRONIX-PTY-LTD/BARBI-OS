import { useEffect, useRef } from 'react';
import barbiMarkup from './barbiMarkup.html?raw';
import { installBarbiBridge } from './barbiBridge';
import { ensureBarbiThreePostProcessing } from './barbiPostProcessing';

declare global {
  interface Window {
    __initBarbiRuntime?: () => void;
    __barbiRuntimeBooted?: boolean;
  }
}

export function BarbiWorkspace() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    ensureBarbiThreePostProcessing();
    installBarbiBridge();

    const bootRuntime = () => {
      const fn = (window as unknown as { __initBarbiRuntime?: () => void }).__initBarbiRuntime;
      if (typeof fn === 'function') fn();
    };

    if (typeof window.__initBarbiRuntime === 'function') {
      bootRuntime();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-barbi-runtime="1"]');
    if (existingScript) {
      bootRuntime();
      return;
    }

    const script = document.createElement('script');
    script.src = '/barbi-runtime.js';
    script.async = false;
    script.dataset.barbiRuntime = '1';
    script.onload = bootRuntime;
    script.onerror = (err) => {
      console.error('Failed to load B.A.R.B.I runtime module:', err);
    };
    document.body.appendChild(script);
  }, []);

  return (
    <div
      id="barbi-workspace-root"
      className="relative w-screen h-screen overflow-hidden bg-black select-none"
      dangerouslySetInnerHTML={{ __html: barbiMarkup }}
    />
  );
}
