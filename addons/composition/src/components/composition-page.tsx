import { type AddonContext, type Holding } from "@wealthfolio/addon-sdk";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
} from "@wealthfolio/ui";
import React, { useEffect, useState } from "react";

interface CompositionPageProps {
  ctx: AddonContext;
}

type RuntimeMoney = { local?: number; base?: number; amount?: number };

function money(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const m = value as RuntimeMoney;
  return m.local ?? m.base ?? m.amount ?? 0;
}

type RuntimeInstrument = {
  symbol?: string | null;
  displayCode?: string | null;
  instrumentSymbol?: string | null;
  name?: string | null;
};

function instrumentSymbol(h: Holding): string {
  const inst = (h.instrument as RuntimeInstrument | null | undefined) ?? null;
  if (inst?.symbol) return inst.symbol;
  if (inst?.displayCode) return inst.displayCode;
  if (inst?.instrumentSymbol) return inst.instrumentSymbol;
  return h.id.length > 12 ? h.id.slice(0, 12) + "..." : h.id;
}

function instrumentName(h: Holding): string {
  const inst = (h.instrument as RuntimeInstrument | null | undefined) ?? null;
  return inst?.name ?? "";
}

function useFetch<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; isLoading: boolean; error: Error | null } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading, error };
}

function fmtMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

function deltaClass(delta: number): string {
  if (delta > 0.05) return "text-success";
  if (delta < -0.05) return "text-destructive";
  return "text-muted-foreground";
}

export const CompositionPage: React.FC<CompositionPageProps> = ({ ctx }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState(false);
  const [editedQty, setEditedQty] = useState<Record<string, number>>({});

  const accountsQuery = useFetch(() => ctx.api.accounts.getAll(), []);
  const accounts = accountsQuery.data ?? [];

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === null) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Reset what-if state when account changes.
  useEffect(() => {
    setEditedQty({});
    setWhatIf(false);
  }, [selectedAccountId]);

  const holdingsQuery = useFetch(
    () =>
      selectedAccountId
        ? ctx.api.portfolio.getHoldings(selectedAccountId)
        : Promise.resolve([] as Holding[]),
    [selectedAccountId],
  );

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const currency = (selectedAccount as { currency?: string } | undefined)?.currency ?? "EUR";

  const rawHoldings = (holdingsQuery.data ?? []).filter(
    (h: Holding) => (h.holdingType as string) !== "cash",
  );

  // Build enriched rows: attach realQty, unitPrice, and simulated values.
  const enriched = rawHoldings.map((h: Holding) => {
    const realMv = money(h.marketValue);
    const realQty = typeof h.quantity === "number" ? h.quantity : 0;
    const unitPrice = realQty > 0 ? realMv / realQty : 0;
    const simQty = whatIf && editedQty[h.id] !== undefined ? editedQty[h.id] : realQty;
    const simMv = unitPrice * simQty;
    return { h, realQty, realMv, unitPrice, simQty, simMv };
  });

  const realTotal = enriched.reduce((s, r) => s + r.realMv, 0);
  const simTotal = enriched.reduce((s, r) => s + r.simMv, 0);

  const rows = [...enriched].sort((a, b) =>
    whatIf ? b.simMv - a.simMv : b.realMv - a.realMv,
  );

  const isLoading = accountsQuery.isLoading || holdingsQuery.isLoading;
  const error = accountsQuery.error || holdingsQuery.error;

  const hasEdits = Object.keys(editedQty).length > 0;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-lg font-semibold sm:text-xl">Composition</h1>
      </PageHeader>
      <PageContent>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1">
              {accounts.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant={selectedAccountId === a.id ? "default" : "outline"}
                  onClick={() => setSelectedAccountId(a.id)}
                >
                  {a.name}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {whatIf && hasEdits && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditedQty({})}
                >
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                variant={whatIf ? "default" : "outline"}
                onClick={() => {
                  setWhatIf((v) => !v);
                  if (whatIf) setEditedQty({});
                }}
              >
                {whatIf ? "What-if: ON" : "What-if"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : error ? (
              <div className="text-destructive text-sm">Error: {error.message}</div>
            ) : rows.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center text-sm">
                No holdings in this account.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-2 py-2">Symbol</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2 text-right">
                        {whatIf ? "Qty (edit)" : "Qty"}
                      </th>
                      {whatIf && (
                        <th className="px-2 py-2 text-right">Unit Price</th>
                      )}
                      <th className="px-2 py-2 text-right">Value</th>
                      <th className="px-2 py-2 text-right">Weight</th>
                      {whatIf && <th className="px-2 py-2 text-right">Delta</th>}
                      <th className="px-2 py-2" style={{ minWidth: "100px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ h, realQty, realMv, unitPrice, simQty, simMv }) => {
                      const realWeight = realTotal > 0 ? (realMv / realTotal) * 100 : 0;
                      const simWeight = simTotal > 0 ? (simMv / simTotal) * 100 : 0;
                      const delta = simWeight - realWeight;
                      const displayWeight = whatIf ? simWeight : realWeight;
                      const isEdited = whatIf && editedQty[h.id] !== undefined;

                      return (
                        <tr
                          key={h.id}
                          className={`border-b last:border-0 ${isEdited ? "bg-muted/30" : ""}`}
                        >
                          <td className="px-2 py-2 font-medium">{instrumentSymbol(h)}</td>
                          <td className="text-muted-foreground px-2 py-2">{instrumentName(h)}</td>
                          <td className="px-2 py-2 text-right">
                            {whatIf ? (
                              <div className="inline-flex flex-col items-end gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={simQty}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setEditedQty((prev) => ({
                                      ...prev,
                                      [h.id]: isNaN(v) ? 0 : v,
                                    }));
                                  }}
                                  className="border-input bg-background w-24 rounded border px-2 py-1 text-right text-sm focus:outline-none focus:ring-1"
                                />
                                {isEdited && (() => {
                                  const qDelta = simQty - realQty;
                                  return (
                                    <span className={`text-xs font-medium ${deltaClass(qDelta)}`}>
                                      {qDelta >= 0 ? "+" : ""}{qDelta % 1 === 0 ? qDelta : qDelta.toFixed(2)}
                                    </span>
                                  );
                                })()}
                              </div>
                            ) : (
                              realQty
                            )}
                          </td>
                          {whatIf && (
                            <td className="text-muted-foreground px-2 py-2 text-right">
                              {fmtMoney(unitPrice, currency)}
                            </td>
                          )}
                          <td className="px-2 py-2 text-right">
                            {fmtMoney(whatIf ? simMv : realMv, currency)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold">
                            {fmtPct(displayWeight)}
                          </td>
                          {whatIf && (
                            <td className={`px-2 py-2 text-right text-xs font-medium ${deltaClass(delta)}`}>
                              {delta >= 0 ? "+" : ""}{fmtPct(delta)}
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                              <div
                                className="bg-primary h-2 rounded-full transition-all duration-200"
                                style={{ width: fmtPct(displayWeight) }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/30 border-t-2 font-semibold">
                      <td className="px-2 py-2" colSpan={whatIf ? 2 : 2}>TOTAL</td>
                      <td className="px-2 py-2 text-right">
                        {whatIf ? (
                          <span className="text-muted-foreground text-xs font-normal">
                            was {rows.reduce((s, r) => s + r.realQty, 0)}
                          </span>
                        ) : (
                          rows.reduce((s, r) => s + r.realQty, 0)
                        )}
                      </td>
                      {whatIf && <td />}
                      <td className="px-2 py-2 text-right">
                        {fmtMoney(whatIf ? simTotal : realTotal, currency)}
                        {whatIf && realTotal !== simTotal && (
                          <div className={`text-xs font-normal ${deltaClass(simTotal - realTotal)}`}>
                            {simTotal >= realTotal ? "+" : ""}
                            {fmtMoney(simTotal - realTotal, currency)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">100%</td>
                      {whatIf && <td />}
                      <td />
                    </tr>
                  </tbody>
                </table>
                {whatIf && (
                  <p className="text-muted-foreground mt-3 text-xs">
                    Prices are fixed at today's market value. Edit quantities to simulate a rebalance.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
};
