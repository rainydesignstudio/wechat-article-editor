'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { historyPosition } from '../lib/templateNavigation';

export type NavigationGuard = (proceed: () => void) => boolean;

// Keep Next's history state intact. Positions let a cancelled Back/Forward
// return to the same entry without clearing the user's forward history.
export function useRouteNavigation(pathname: string | null) {
  const router = useRouter();
  const guardRef = useRef<NavigationGuard | null>(null);
  const positionRef = useRef(-1);
  const restoringRef = useRef(false);
  const approvedRef = useRef(false);
  const afterRestoreRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const position = historyPosition(window.history.state) ?? positionRef.current + 1;
    positionRef.current = position;
    window.history.replaceState({ ...window.history.state, rainyHistoryPosition: position }, '', window.location.href);
  }, [pathname]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = historyPosition(event.state);
      if (restoringRef.current) {
        event.stopImmediatePropagation();
        restoringRef.current = false;
        afterRestoreRef.current?.();
        afterRestoreRef.current = null;
        return;
      }
      if (approvedRef.current) {
        approvedRef.current = false;
        if (target !== null) positionRef.current = target;
        return;
      }
      if (target === null || target === positionRef.current || !guardRef.current) return;
      const distance = target - positionRef.current;
      const proceed = () => {
        const jump = () => { approvedRef.current = true; window.history.go(distance); };
        if (restoringRef.current) afterRestoreRef.current = jump;
        else jump();
      };
      if (guardRef.current(proceed)) {
        event.stopImmediatePropagation();
        restoringRef.current = true;
        window.history.go(-distance);
      } else positionRef.current = target;
    };
    window.addEventListener('popstate', onPopState, true);
    return () => window.removeEventListener('popstate', onPopState, true);
  }, []);

  const registerNavigationGuard = useCallback((guard: NavigationGuard) => {
    guardRef.current = guard;
    return () => { if (guardRef.current === guard) guardRef.current = null; };
  }, []);

  const navigateRoute = useCallback((href: string) => {
    const proceed = () => router.push(href);
    if (!guardRef.current?.(proceed)) proceed();
  }, [router]);

  return { navigateRoute, registerNavigationGuard };
}
