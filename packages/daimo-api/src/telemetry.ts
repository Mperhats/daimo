import { assert } from "@daimo/common";
import { SpanStatusCode } from "@opentelemetry/api";
import geoIP from "geoip-lite";
// @ts-ignore - add once @types/libhoney PR ships
import Libhoney from "libhoney";

import { TrpcRequestContext } from "./trpc";

// More keys to come. This list ensures we don't duplicate columns.
export type TelemKey =
  | "ts"
  | "duration_ms"
  | "status_code"
  | "trace.trace_id"
  | "service.name"
  | "action.name"
  | "action.account_name"
  | "rpc.path"
  | "rpc.ip_addr"
  | "rpc.ip_country"
  | "rpc.user_agent";

/**
 * Server-side API telemetry.
 * - Track and improve reliability and performance.
 * - Track basic usage and adoption.
 *
 * We create two Honeycomb datasets:
 * - daimo-api for automatic instrumentation. Granalar, uses spans.
 * - daimo-events for manually recorded events.
 *
 * Manually recorded spans don't work.
 */
export class Telemetry {
  private honeyEvents: Libhoney | null;
  private honeyRpc: Libhoney | null;

  constructor() {
    const apiKey = process.env.HONEYCOMB_API_KEY || "";
    if (apiKey === "") {
      console.log(`[TELEM] no HONEYCOMB_API_KEY set, telemetry disabled`);
      this.honeyEvents = null;
      this.honeyRpc = null;
    } else {
      this.honeyEvents = new Libhoney({
        writeKey: apiKey,
        dataset: "daimo-events",
        sampleRate: 1,
      });
      this.honeyRpc = new Libhoney({
        writeKey: apiKey,
        dataset: "daimo-rpc",
        sampleRate: 1,
      });
    }
  }

  recordRpc(
    ctx: TrpcRequestContext,
    path: string,
    success: boolean,
    durationMs: number
  ) {
    const { ipAddr, userAgent } = ctx;
    const ipGeo = geoIP.lookup(ipAddr);
    const ipCountry = ipGeo?.country || "unknown";

    this.honeyRpc?.sendNow({
      status_code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      "trace.trace_id": ("" + Math.random()).slice(2),
      duration_ms: durationMs,
      "service.name": "daimo-api",
      "rpc.path": path,
      "rpc.ip_addr": ipAddr,
      "rpc.ip_country": ipCountry,
      "rpc.user_agent": userAgent,
    });
  }

  recordUserAction(
    actionName: string,
    accountName: string,
    ctx: TrpcRequestContext
  ) {
    console.log(`[TELEM] recording ${actionName} ${accountName}`);

    const { ipAddr, userAgent } = ctx;
    const ipGeo = geoIP.lookup(ipAddr);
    const ipCountry = ipGeo?.country || "unknown";

    this.honeyEvents?.sendNow({
      "service.name": "daimo-api",
      "event.type": "user-action",
      "event.name": actionName,
      "event.account_name": accountName,
      "rpc.ip_addr": ipAddr,
      "rpc.ip_country": ipCountry,
      "rpc.user_agent": userAgent,
    });

    if (actionName === "deployWallet") {
      this.recordClippy(
        `It looks like you have a new user! ${accountName} from ${ipCountry}`
      );
    }
  }

  /** Clippy is our Slack bot for API monitoring. */
  private recordClippy(message: string) {
    console.log(`[TELEM] clippy: ${message}`);

    const url = process.env.CLIPPY_WEBHOOK_URL || "";
    assert(url != null, "CLIPPY_WEBHOOK_URL not set");
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  }
}
