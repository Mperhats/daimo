import { UserOpHex } from "@daimo/common";
import { hexToNumber } from "viem";

import { validateMemo } from "./validateMemo";
import { NameRegistry } from "../contract/nameRegistry";
import { BundlerClient } from "../network/bundlerClient";
import { ViemClient } from "../network/viemClient";
import { InviteCodeTracker } from "../offchain/inviteCodeTracker";
import { PaymentMemoTracker } from "../offchain/paymentMemoTracker";
import { Telemetry } from "../server/telemetry";
import { TrpcRequestContext } from "../server/trpc";

export async function sendUserOpV2(
  op: UserOpHex,
  memo: string | undefined,
  nameReg: NameRegistry,
  bundlerClient: BundlerClient,
  inviteCodeTracker: InviteCodeTracker,
  paymentMemoTracker: PaymentMemoTracker,
  telemetry: Telemetry,
  vc: ViemClient,
  context: TrpcRequestContext
) {
  const span = context.span!;
  span.setAttribute("op.sender", op.sender);
  const senderName = nameReg.resolveDaimoNameForAddr(op.sender);
  span.setAttribute("op.sender_name", senderName || "");
  span.setAttribute("op.nonce", op.nonce);
  const h = hexToNumber;
  span.setAttribute("op.call_gas_limit", h(op.callGasLimit));
  span.setAttribute("op.pre_ver_gas", h(op.preVerificationGas));
  span.setAttribute("op.ver_gas_limit", h(op.verificationGasLimit));
  span.setAttribute("op.paymaster", op.paymasterAndData);
  span.setAttribute("op.memo", memo || "undefined");

  try {
    const opHash = await bundlerClient.sendUserOp(op, vc, nameReg);
    if (memo && validateMemo(memo) === "ok") {
      await paymentMemoTracker.addMemo(opHash, memo);
    }

    // Creating a valid userop authenticates the user, so we can attach
    // private data like user's unique inviteCode in the response.
    const inviteCode = await inviteCodeTracker.getBestInviteCodeForSender(
      op.sender
    );
    return {
      opHash,
      inviteCode,
    };
  } catch (e: any) {
    const em = e.message || "no error message";
    span.setAttribute("op.send_err", em);
    telemetry.recordClippy(`sendUserOp ${senderName}: ${em}`, "error");
    throw e;
  }
}
