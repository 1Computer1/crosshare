import { useCallback, useState, useEffect } from 'react';

import { AppProps } from 'next/app';
import { useAuthState } from 'react-firebase-hooks/auth';

import { App } from '../lib/firebaseWrapper';
import { AuthContext } from '../components/AuthContext';
import { CrosshareAudioContext } from '../components/CrosshareAudioContext';

import '../lib/style.css';

const MyApp = ({ Component, pageProps }: AppProps) => {
  const [user, loadingUser, error] = useAuthState(App.auth());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user && user.email) {
      user.getIdTokenResult()
        .then((idTokenResult) => {
          if (!!idTokenResult.claims.admin) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        })
        .catch((error) => {
          setIsAdmin(false);
          console.error(error);
        });
    }
  }, [user]);

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const initAudioContext = useCallback(() => {
    if (!audioContext) {
      const constructor = window.AudioContext || (window as any).webkitAudioContext;
      setAudioContext(new constructor());
    }
  }, [audioContext, setAudioContext]);

  return (
    <CrosshareAudioContext.Provider value={[audioContext, initAudioContext]}>
      <AuthContext.Provider value={{ user, isAdmin, loadingUser, error: error ?.message}}>
        <Component {...pageProps} />
      </AuthContext.Provider>;
    </CrosshareAudioContext.Provider>
  );
}

export default MyApp;
