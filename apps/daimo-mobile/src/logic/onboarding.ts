import { SlotType, getSlotType } from "@daimo/common";
import { useCallback, useContext } from "react";

import { DispatcherContext } from "../action/dispatch";
import { useNav } from "../common/nav";
import { Account } from "../model/account";

export function useOnboardingChecklist(account: Account) {
  const nav = useNav();
  const dispatcher = useContext(DispatcherContext);

  const hasBackup = account.accountKeys.some(
    (key) => getSlotType(key.slot) === SlotType.PasskeyBackup
  );

  const farcasterConnected = !!account.linkedAccounts.find(
    (a) => a.type === "farcaster"
  );

  const allComplete = hasBackup && farcasterConnected;

  const handleSecureAccount = useCallback(() => {
    nav.navigate("SettingsTab", { screen: "AddPasskey" });
    dispatcher.dispatch({ name: "hideBottomSheet" });
  }, [nav, dispatcher]);

  const handleConnectFarcaster = useCallback(() => {
    nav.navigate("Settings");
    dispatcher.dispatch({ name: "connectFarcaster" });
  }, [nav, dispatcher]);

  const dismissSheet = useCallback(() => {
    dispatcher.dispatch({ name: "hideBottomSheet" });
  }, [dispatcher]);

  return {
    hasBackup,
    farcasterConnected,
    allComplete,
    handleSecureAccount,
    handleConnectFarcaster,
    dismissSheet,
  };
}