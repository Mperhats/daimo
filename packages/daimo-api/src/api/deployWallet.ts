import { DaimoAccountCall } from "@daimo/common";
import {
  chainConfig,
  daimoEphemeralNotesAddress,
  erc20ABI,
} from "@daimo/contract";
import { Address, Hex, encodeFunctionData } from "viem";

import { AccountFactory } from "../contract/accountFactory";
import { NameRegistry } from "../contract/nameRegistry";

export async function deployWallet(
  name: string,
  pubKeyHex: Hex,
  nameReg: NameRegistry,
  accountFactory: AccountFactory
): Promise<Address> {
  const maxUint256 = 2n ** 256n - 1n;
  const initCalls: DaimoAccountCall[] = [
    {
      // Approve notes contract infinite spending on behalf of the account
      dest: chainConfig.tokenAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: "approve",
        args: [daimoEphemeralNotesAddress, maxUint256],
      }),
    },
    {
      // Approve paymaster contract infinite spending on behalf of the account
      // While we no longer use the Pimlico paymaster, we approve it as a backup
      // in case our own free paymaster is failing in future.
      dest: chainConfig.tokenAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: "approve",
        args: [chainConfig.pimlicoPaymasterAddress, maxUint256],
      }),
    },
    nameReg.getRegisterNameCall(name), // Register name
  ];

  // TODO: put a check for the counterfactual address on client side so the server is not trusted.
  const address = await accountFactory.getAddress(pubKeyHex, initCalls);

  console.log(`[API] Deploying account for ${name}, address ${address}`);
  const deployReceipt = await accountFactory.deploy(pubKeyHex, initCalls);

  // If it worked, cache the name<>address mapping immediately.
  if (deployReceipt.status === "success") {
    nameReg.onSuccessfulRegister(name, address);
  } else {
    throw new Error(`Couldn't create ${name}: ${deployReceipt.status}`);
  }

  return address;
}
