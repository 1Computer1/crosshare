import { useState, useEffect } from 'react';
import useEventListener from '@use-it/event-listener';

export function useTimer():[number, boolean, ()=>void, ()=>void] {
  // TODO should probably change this to always 0 so we can style the init page
  const init = process.env.NODE_ENV === 'development' ? (new Date()).getTime() : 0;
  const [currentWindowStart, setCurrentWindowStart] = useState<number>(init);
  const [bankedSeconds, setBankedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  useEventListener('blur', prodPause);

  function prodPause() {
    if (process.env.NODE_ENV !== 'development') {
      pause();
    }
  }

  useEffect(() => {
    function tick() {
      if (currentWindowStart) {
        setTotalSeconds(bankedSeconds + ((new Date()).getTime() - currentWindowStart) / 1000);
      }
    }
    let id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [bankedSeconds, currentWindowStart]);

  function resume() {
    setCurrentWindowStart((new Date()).getTime());
  }

  function pause() {
    if (currentWindowStart) {
      setBankedSeconds(bankedSeconds + ((new Date()).getTime() - currentWindowStart) / 1000);
      setCurrentWindowStart(0);
    }
  }

  return [totalSeconds, currentWindowStart === 0, pause, resume];
}