import { ignore } from "@daimo/common";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

interface NetworkState {
  status: "online" | "offline";
  syncAttemptsFailed: number;
}

let currentState: NetworkState = { status: "online", syncAttemptsFailed: 0 };

const listeners = new Set<(state: NetworkState) => void>();

export function useNetworkState() {
  const [state, setState] = useState<NetworkState>(currentState);

  useEffect(() => {
    listeners.add(setState);
    return () => ignore(listeners.delete(setState));
  }, []);

  return state;
}

export function getNetworkState() {
  return currentState;
}

// Marks us as being back online
export function updateNetworkStateOnline() {
  updateNetworkState((state) => ({ status: "online", syncAttemptsFailed: 0 }));
}

// Updates network state, atomically
export function updateNetworkState(fn: (state: NetworkState) => NetworkState) {
  const newState = fn(currentState);
  const oldJson = JSON.stringify(currentState);
  const newJson = JSON.stringify(newState);
  if (oldJson === newJson) return;

  if (newState.status === "offline") {
    // create small delay to let interface adopt to the new banner
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 200);
  }

  console.log(`[NETWORK] updating ${oldJson} > ${newJson}`);
  currentState = newState;
  listeners.forEach((listener) => listener(currentState));
}
