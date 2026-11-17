import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import posthog, { isPostHogConfigured } from './posthog.ts';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let currentUserSnapshot: User | null = null;
let identifiedUserId: string | null = null;

onAuthStateChanged(auth, (user) => {
  currentUserSnapshot = user;

  if (!isPostHogConfigured) return;

  if (!user) {
    if (identifiedUserId) {
      posthog.reset();
      identifiedUserId = null;
    }
    return;
  }

  if (identifiedUserId && identifiedUserId !== user.uid) {
    posthog.reset();
  }

  if (identifiedUserId !== user.uid) {
    posthog.identify(user.uid, {
      ...(user.email ? { email: user.email } : {}),
      ...(user.displayName ? { name: user.displayName } : {}),
    });
    identifiedUserId = user.uid;
  }
});

export function getCurrentFirebaseUser(): User | null {
  return currentUserSnapshot || auth.currentUser;
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  const result = await signInWithPopup(auth, googleProvider);
  currentUserSnapshot = result.user;
  return result.user;
}

export async function signOutBarbi(): Promise<void> {
  await signOut(auth);
  currentUserSnapshot = null;
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
