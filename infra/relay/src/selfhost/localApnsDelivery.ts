import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";

import type { SignedApnsDeliveryJob } from "../agentActivity/apnsDeliveryJobs.ts";
import * as ApnsDeliveries from "../agentActivity/ApnsDeliveries.ts";
import { ApnsDeliveryQueueSender } from "../agentActivity/ApnsDeliveryQueue.ts";

/**
 * Self-hosted stand-in for Cloudflare Queues: an in-process Effect queue.
 * APNs delivery volume is push notifications, not bulk traffic, so a
 * durable broker (Redis/BullMQ) is unnecessary — jobs that don't survive a
 * process restart are acceptable here the same way Cloudflare Queues' at-most
 * around-restart semantics are.
 */
export class LocalApnsQueue extends Context.Service<
  LocalApnsQueue,
  Queue.Queue<SignedApnsDeliveryJob>
>()("t3code-relay/selfhost/localApnsDelivery/LocalApnsQueue") {}

export const queueLayer = Layer.effect(LocalApnsQueue, Queue.unbounded<SignedApnsDeliveryJob>());

/**
 * Enqueues onto {@link LocalApnsQueue} instead of a Cloudflare Queue.
 * Requires `LocalApnsQueue` from context rather than baking `queueLayer` in,
 * so the caller can `Layer.provideMerge(queueLayer)` once and share the same
 * queue instance with {@link runConsumer}.
 */
export const senderLayer = Layer.effect(
  ApnsDeliveryQueueSender,
  Effect.gen(function* () {
    const queue = yield* LocalApnsQueue;
    return ApnsDeliveryQueueSender.of({
      send: (body) => Queue.offer(queue, body).pipe(Effect.asVoid),
    });
  }),
);

/**
 * Drains {@link LocalApnsQueue} forever, delivering each signed job the same
 * way the Cloudflare Queue consumer does in `worker.ts`. Fork this with the
 * fully-built runtime layer provided (it needs `ApnsDeliveries` and
 * everything that depends on).
 */
export const runConsumer = Effect.gen(function* () {
  const queue = yield* LocalApnsQueue;
  const deliveries = yield* ApnsDeliveries.ApnsDeliveries;
  return yield* Queue.take(queue).pipe(
    Effect.flatMap((body) => deliveries.processSignedJob(body)),
    Effect.withSpan("relay.selfhost.apns_delivery_queue.process_message"),
    Effect.catch((error: unknown) =>
      Effect.logError("relay.selfhost.apns_delivery_failed", { error }),
    ),
    Effect.forever,
  );
});
