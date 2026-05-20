/*
 * PaymentProvider abstraction (Stage 14k-m).
 *
 * Цель — изолировать checkout/webhook логику от конкретного payment-provider'a.
 * Stage 14 ships Mock adapter (для E2E тестов до LemonSqueezy approval).
 * Stage 14.5 / Sprint 2: добавляем LemonSqueezyProvider — switching через
 * env.PAYMENT_PROVIDER без правок в endpoint'ах.
 *
 * Решение по provider'у (apply-flow-spec FLOW-9 / E3):
 *   - LemonSqueezy (long-term, MoR, simpler API)
 *   - Paddle (alt, более enterprise)
 *   - Stripe (отложено — требует US LLC)
 *   - Mock (Sprint 1, тест без денег)
 */

import type { ApplicationRow, UserRow } from "../../../db/types";

// ============================================================
// Types
// ============================================================

export interface PaymentLineItem {
  name: string;
  description?: string;
  amount_cents: number;
  currency: string;
  quantity: number;
}

export interface CreateCheckoutInput {
  application: ApplicationRow;
  user: UserRow;
  successUrl: string;
  cancelUrl: string;
  items: PaymentLineItem[];
  /** Метаданные передаются провайдеру; возвращаются в webhook'е для reconciliation. */
  metadata: Record<string, string>;
}

export interface CheckoutResult {
  url: string;            // URL для redirect клиента
  session_id: string;     // provider session id (для tracking)
}

export type PaymentEventKind =
  | "checkout_completed"
  | "refund_processed"
  | "unknown";

export interface PaymentEvent {
  kind: PaymentEventKind;
  session_id: string | null;
  payment_id: string | null;
  application_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  /** Raw event для логирования. */
  raw: unknown;
}

export interface RefundResult {
  refund_id: string;
  amount_cents: number;
  status: "succeeded" | "pending" | "failed";
}

export interface PaymentProvider {
  name: "mock" | "lemonsqueezy" | "paddle";
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyWebhookSignature(rawBody: string, signature: string, env: Cloudflare.Env): Promise<boolean>;
  parseWebhookEvent(body: unknown): PaymentEvent;
  refund(env: Cloudflare.Env, paymentId: string, amountCents?: number): Promise<RefundResult>;
}

// ============================================================
// Mock provider (Stage 14, до LemonSqueezy approval)
// ============================================================

/**
 * Mock provider — для E2E тестов в Sprint 1 без реальных денег.
 *
 * createCheckoutSession возвращает URL на `/api/checkout/mock-complete?...`
 * который имитирует successful provider webhook (markAsPaid + audit_log
 * + enrollment INSERT + confirmation email).
 *
 * Refund имитирует success без побочных эффектов в Stripe-стиле — caller
 * (admin endpoint) сам обновит D1 application.status='refunded'.
 *
 * verifyWebhookSignature всегда true для mock — нет реальной signature.
 * Production переключение PAYMENT_PROVIDER=lemonsqueezy → swap adapter.
 */
const mockProvider: PaymentProvider = {
  name: "mock",

  async createCheckoutSession(input) {
    const sessionId = `mock_cs_${crypto.randomUUID()}`;
    // Build URL relative to successUrl origin
    const url = new URL(input.successUrl);
    url.pathname = "/api/checkout/mock-complete";
    url.searchParams.set("application_id", input.application.id);
    url.searchParams.set("session_id", sessionId);
    return {
      url: url.toString(),
      session_id: sessionId,
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyWebhookSignature(_rawBody, _signature, _env) {
    return true;
  },

  parseWebhookEvent(body) {
    // Mock webhook payload (см. /api/checkout/mock-complete)
    type MockBody = {
      kind?: string;
      session_id?: string;
      payment_id?: string;
      application_id?: string;
      amount_cents?: number;
      currency?: string;
    };
    const b = (body && typeof body === "object" ? body : {}) as MockBody;
    const kind: PaymentEventKind =
      b.kind === "checkout_completed" || b.kind === "refund_processed" ? b.kind : "unknown";
    return {
      kind,
      session_id: b.session_id ?? null,
      payment_id: b.payment_id ?? null,
      application_id: b.application_id ?? null,
      amount_cents: b.amount_cents ?? null,
      currency: b.currency ?? null,
      raw: body,
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refund(_env, paymentId, amountCents) {
    return {
      refund_id: `mock_ref_${crypto.randomUUID()}`,
      amount_cents: amountCents ?? 0,
      status: "succeeded",
    };
  },
};

// ============================================================
// Provider resolution
// ============================================================

/**
 * Возвращает active payment provider based on env.PAYMENT_PROVIDER.
 *   - "mock" (default) — Sprint 1 testing
 *   - "lemonsqueezy" — production (Stage 14.5+)
 *   - "paddle" — alt production
 */
export function getPaymentProvider(env: Cloudflare.Env): PaymentProvider {
  const name = env.PAYMENT_PROVIDER ?? "mock";
  if (name === "mock") return mockProvider;
  // Future:
  // if (name === "lemonsqueezy") return lemonSqueezyProvider;
  // if (name === "paddle") return paddleProvider;
  throw new Error(`Unknown PAYMENT_PROVIDER='${name}'. Supported: mock`);
}
