import { EAccount, OpEvent, UserOpHex, dollarsToAmount } from "@daimo/common";
import { DaimoOpSender, OpSenderCallback } from "@daimo/userop";
import { useCallback, useEffect } from "react";
import { Address, Hex } from "viem";

import { ActHandle, SetActStatus, useActStatus } from "./actStatus";
import { getWrappedRawSigner } from "../logic/key";
import { isPasskeySlot } from "../logic/keySlot";
import { NamedError } from "../logic/log";
import { getWrappedPasskeySigner } from "../logic/passkey";
import { rpcFunc } from "../logic/trpc";
import { useAccount } from "../model/account";

/** Send a user op, returning the userOpHash. */
type SendOpFn = (opSender: DaimoOpSender) => Promise<Hex>;

/** Send a user op, track status. */
export function useSendAsync({
  dollarsToSend,
  sendFn,
  pendingOp,
  namedAccounts,
}: {
  dollarsToSend: number;
  sendFn: SendOpFn;
  pendingOp?: OpEvent;
  namedAccounts?: EAccount[];
}): ActHandle {
  const [as, setAS] = useActStatus();

  const [account, setAccount] = useAccount();
  if (!account) throw new Error("No account");

  const keySlot = account.accountKeys.find(
    (keyData) => keyData.pubKey === account.enclavePubKey
  )?.slot;
  // const keySlot = 128; // Testing passkey

  // TODO: Async load fee estimation from API to add precision
  const feeDollars = account.chainGasConstants.estimatedFee;
  const cost = { feeDollars, totalDollars: dollarsToSend + feeDollars };

  const exec = useCallback(async () => {
    const handle = await sendAsync(
      setAS,
      account.enclaveKeyName,
      account.address,
      keySlot,
      sendFn
    );

    // Add pending op and named accounts to history
    if (pendingOp) {
      pendingOp.opHash = handle as Hex;
      pendingOp.timestamp = Math.floor(Date.now() / 1e3);
      pendingOp.feeAmount = Number(dollarsToAmount(feeDollars));

      const newAccount = {
        ...account,
        recentTransfers: [...account.recentTransfers, pendingOp],
        namedAccounts: [...account.namedAccounts, ...(namedAccounts || [])],
      };

      // TODO: add pending device add/removes
      console.log(`[SEND] added pending op ${pendingOp.opHash}`);

      setAccount(newAccount);
    }
  }, [account.enclaveKeyName, keySlot, sendFn]);

  return { ...as, exec, cost };
}

/** Warm the DaimoOpSender cache. */
export function useWarmCache(
  enclaveKeyName?: string,
  address?: Address,
  keySlot?: number
) {
  useEffect(() => {
    if (!enclaveKeyName || !address || !keySlot) return;
    loadOpSender(enclaveKeyName, address, keySlot);
  }, [enclaveKeyName, address, keySlot]);
}

const accountCache: Map<[Address, number], Promise<DaimoOpSender>> = new Map();

function loadOpSender(
  enclaveKeyName: string,
  address: Address,
  keySlot: number
) {
  let promise = accountCache.get([address, keySlot]);
  if (promise) return promise;

  const signer = isPasskeySlot(keySlot)
    ? getWrappedPasskeySigner()
    : getWrappedRawSigner(enclaveKeyName, keySlot);

  const sender: OpSenderCallback = (op: UserOpHex) =>
    rpcFunc.sendUserOp.mutate({ op });

  console.info(
    `[SEND] loading DaimoOpSender ${address} ${enclaveKeyName} ${keySlot}`
  );
  promise = DaimoOpSender.initFromEnv(address, signer, sender);
  accountCache.set([address, keySlot], promise);

  return promise;
}

async function sendAsync(
  setAS: SetActStatus,
  enclaveKeyName: string,
  address: Address,
  keySlot: number | undefined,
  sendFn: SendOpFn
) {
  try {
    if (keySlot === undefined) throw new Error("No key slot");
    setAS("loading", "Loading account...");
    const opSender = await loadOpSender(enclaveKeyName, address, keySlot);

    setAS("loading", "Signing...");
    const handle = await sendFn(opSender);
    setAS("success", "Accepted");

    return handle;
  } catch (e: any) {
    console.error(e);
    if (keySlot === undefined) {
      setAS("error", "Device removed from account");
    } else if (e instanceof NamedError && e.name === "ExpoEnclaveSign") {
      setAS("error", e.message);
    } else setAS("error", "Error sending transaction");
    throw e;
  }
}
