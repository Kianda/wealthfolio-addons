import {
  type AccountValuation,
  type AddonContext,
  type Holding,
  type PerformanceMetrics,
} from "@wealthfolio/addon-sdk";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
} from "@wealthfolio/ui";
import React, { useEffect, useState } from "react";

interface RoiPageProps {
  ctx: AddonContext;
}

type TimeRange = "ALL" | "YTD" | "1Y" | "6M" | "3M" | "1M";

const TIME_RANGES: { code: TimeRange; label: string }[] = [
  { code: "1M", label: "1M" },
  { code: "3M", label: "3M" },
  { code: "6M", label: "6M" },
  { code: "YTD", label: "YTD" },
  { code: "1Y", label: "1Y" },
  { code: "ALL", label: "ALL" },
];

function computeDateRange(range: TimeRange): { startDate: string; endDate: string } | null {
  if (range === "ALL") return null;
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  switch (range) {
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "YTD":
      start.setMonth(0, 1); // 1 January
      break;
  }
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

interface AccountRoi {
  id: string;
  name: string;
  currency: string;
  totalValue: number;
  netContribution: number;
  gain: number;
  roi: number | null;
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
  if (inst?.name) return inst.name;
  return h.id.length > 12 ? h.id.slice(0, 12) + "…" : h.id;
}

function instrumentName(h: Holding): string {
  const inst = (h.instrument as RuntimeInstrument | null | undefined) ?? null;
  return inst?.name ?? "—";
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
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtPct(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return (ratio * 100).toFixed(2) + "%";
}

function classForReturn(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "text-muted-foreground";
  }
  return value >= 0 ? "text-success" : "text-destructive";
}

function buildAccountRoi(valuation: AccountValuation, name: string): AccountRoi {
  const totalValue = valuation.totalValue ?? 0;
  const netContribution = valuation.netContribution ?? 0;
  const gain = totalValue - netContribution;
  const roi = netContribution !== 0 ? gain / netContribution : null;
  return {
    id: valuation.accountId,
    name,
    currency: valuation.accountCurrency || valuation.baseCurrency || "USD",
    totalValue,
    netContribution,
    gain,
    roi,
  };
}

export const RoiPage: React.FC<RoiPageProps> = ({ ctx }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");

  const accountsQuery = useFetch(() => ctx.api.accounts.getAll(), []);
  const accountIds = (accountsQuery.data ?? []).map((a) => a.id);
  const accountIdsKey = accountIds.sort().join(",");

  const valuationsQuery = useFetch(
    () =>
      accountIds.length === 0
        ? Promise.resolve([] as AccountValuation[])
        : ctx.api.portfolio.getLatestValuations(accountIds),
    [accountIdsKey],
  );

  // For sub-period: fetch performance summary per account.
  // For ALL: skip (lifetime ROI comes from AccountValuation directly).
  const performanceQuery = useFetch<Map<string, PerformanceMetrics>>(
    () => {
      if (timeRange === "ALL" || accountIds.length === 0) {
        return Promise.resolve(new Map());
      }
      const dr = computeDateRange(timeRange);
      if (!dr) return Promise.resolve(new Map());
      return Promise.all(
        accountIds.map((id) =>
          ctx.api.performance
            .calculateSummary({
              itemType: "account",
              itemId: id,
              startDate: dr.startDate,
              endDate: dr.endDate,
            })
            .then((perf) => [id, perf] as const)
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn("[ROI Tracker] performance fetch failed:", id, err);
              return [id, null] as const;
            }),
        ),
      ).then(
        (entries) =>
          new Map(
            entries
              .filter((e): e is readonly [string, PerformanceMetrics] => e[1] !== null)
              .map(([id, perf]) => [id, perf]),
          ),
      );
    },
    [timeRange, accountIdsKey],
  );

  const isLoading =
    accountsQuery.isLoading ||
    valuationsQuery.isLoading ||
    (timeRange !== "ALL" && performanceQuery.isLoading);
  const error = accountsQuery.error || valuationsQuery.error;

  const accountById = new Map((accountsQuery.data ?? []).map((a) => [a.id, a]));

  const rows: AccountRoi[] = (valuationsQuery.data ?? [])
    .map((v) => buildAccountRoi(v, accountById.get(v.accountId)?.name ?? v.accountId))
    .sort((a, b) => a.name.localeCompare(b.name));

  // For each account, compute the gain + rate to display, depending on timeRange.
  const getDisplayValues = (
    row: AccountRoi,
  ): { gain: number; rate: number | null } => {
    if (timeRange === "ALL") {
      return { gain: row.gain, rate: row.roi };
    }
    const perf = performanceQuery.data?.get(row.id);
    if (!perf) return { gain: 0, rate: null };
    const periodGain = Number(perf.periodGain ?? 0);
    const cumulativeTwr =
      perf.cumulativeTwr != null ? Number(perf.cumulativeTwr) : null;
    return { gain: periodGain, rate: cumulativeTwr };
  };

  // Aggregate row (TOTAL)
  const totalContribution = rows.reduce((s, r) => s + r.netContribution, 0);
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);
  const aggregateCurrency = rows[0]?.currency ?? "USD";

  const totalDisplay =
    timeRange === "ALL"
      ? {
          gain: rows.reduce((s, r) => s + r.gain, 0),
          rate: totalContribution !== 0 ? rows.reduce((s, r) => s + r.gain, 0) / totalContribution : null,
        }
      : (() => {
          const sumGain = rows.reduce((s, r) => s + getDisplayValues(r).gain, 0);
          // TWR aggregate: net-contribution-weighted average. Not the true
          // portfolio-level TWR (that would require chained daily portfolio
          // returns), but acceptable when accounts share the same currency.
          const weights = rows.map((r) => r.netContribution);
          const totalWeight = weights.reduce((s, w) => s + w, 0);
          if (totalWeight === 0) return { gain: sumGain, rate: null };
          const weightedRate = rows.reduce((s, r, idx) => {
            const dv = getDisplayValues(r);
            if (dv.rate == null) return s;
            return s + (dv.rate * weights[idx]) / totalWeight;
          }, 0);
          return { gain: sumGain, rate: weightedRate };
        })();

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rateLabel = timeRange === "ALL" ? "ROI" : "Return";

  // Short, single-line description in the page header.
  // The detailed methodology lives in a separate card at the bottom of the page.
  const headerDescription =
    timeRange === "ALL"
      ? "Lifetime Return on Investment per account: gain divided by money actually deposited."
      : `Time-Weighted Return cumulated over the last ${timeRange}.`;

  return (
    <Page>
      <PageHeader>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold sm:text-xl">ROI Tracker</h1>
          <p className="text-muted-foreground text-sm sm:text-base">{headerDescription}</p>
        </div>
      </PageHeader>
      <PageContent>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Accounts</CardTitle>
            <div className="flex flex-wrap gap-1">
              {TIME_RANGES.map((r) => (
                <Button
                  key={r.code}
                  size="sm"
                  variant={timeRange === r.code ? "default" : "outline"}
                  onClick={() => setTimeRange(r.code)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : error ? (
              <div className="text-destructive text-sm">
                Error loading data: {error.message}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center text-sm">
                No accounts found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Account</th>
                      <th className="px-2 py-2 text-right">Total Value</th>
                      <th className="px-2 py-2 text-right">Net Contribution</th>
                      <th className="px-2 py-2 text-right">Net Gain</th>
                      <th className="px-2 py-2 text-right">{rateLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const dv = getDisplayValues(row);
                      return (
                        <React.Fragment key={row.id}>
                          <tr
                            className="hover:bg-muted/40 cursor-pointer border-b"
                            onClick={() => toggle(row.id)}
                          >
                            <td className="px-2 py-2">
                              {expanded.has(row.id) ? (
                                <Icons.ChevronDown className="h-4 w-4" />
                              ) : (
                                <Icons.ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-2 py-2 font-medium">{row.name}</td>
                            <td className="px-2 py-2 text-right">
                              {fmtMoney(row.totalValue, row.currency)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {fmtMoney(row.netContribution, row.currency)}
                            </td>
                            <td className={`px-2 py-2 text-right ${classForReturn(dv.gain)}`}>
                              {fmtMoney(dv.gain, row.currency)}
                            </td>
                            <td className={`px-2 py-2 text-right font-semibold ${classForReturn(dv.rate)}`}>
                              {fmtPct(dv.rate)}
                            </td>
                          </tr>
                          {expanded.has(row.id) && (
                            <tr>
                              <td colSpan={6} className="bg-muted/20 px-2 py-3">
                                <HoldingsTable
                                  ctx={ctx}
                                  accountId={row.id}
                                  currency={row.currency}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {rows.length > 1 && (
                      <tr className="bg-muted/30 border-t-2 font-semibold">
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2">TOTAL</td>
                        <td className="px-2 py-2 text-right">
                          {fmtMoney(totalValue, aggregateCurrency)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {fmtMoney(totalContribution, aggregateCurrency)}
                        </td>
                        <td className={`px-2 py-2 text-right ${classForReturn(totalDisplay.gain)}`}>
                          {fmtMoney(totalDisplay.gain, aggregateCurrency)}
                        </td>
                        <td className={`px-2 py-2 text-right ${classForReturn(totalDisplay.rate)}`}>
                          {fmtPct(totalDisplay.rate)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <MethodologyCard timeRange={timeRange} />
      </PageContent>
    </Page>
  );
};

// ─── Methodology card ─────────────────────────────────────────────────────────

const MethodologyCard: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        className="hover:bg-muted/30 flex cursor-pointer flex-row items-center justify-between space-y-0 py-3"
        onClick={() => setOpen((o) => !o)}
      >
        <CardTitle className="text-sm">Methodology</CardTitle>
        {open ? (
          <Icons.ChevronDown className="h-4 w-4" />
        ) : (
          <Icons.ChevronRight className="h-4 w-4" />
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1 font-semibold">
            ALL — Lifetime ROI{" "}
            {timeRange === "ALL" && (
              <span className="text-primary text-xs">(currently shown)</span>
            )}
          </h3>
          <p className="text-muted-foreground">
            Answers: <em>"How much did I make on the money I actually deposited?"</em>
          </p>
          <pre className="bg-muted/40 mt-2 overflow-x-auto rounded p-2 text-xs">
{`ROI = (Total Value − Net Contribution) / Net Contribution

where  Net Contribution = total deposits − total withdrawals  (lifetime)

Example:
  Total Value         = €11,000
  Net Contribution    = €10,000
  Gain                = €1,000
  ROI                 = 1,000 / 10,000 = 10%`}
          </pre>
          <p className="text-muted-foreground mt-2">
            <strong>Money-weighted, by design.</strong> This metric conflates
            timing skill with asset performance. A €9,000 deposit the day
            before a 1% rally looks identical to a €100 deposit a year ago
            that doubled. That's the intended behaviour for "how much did I
            make in absolute terms relative to my capital today" — but it's
            not a measure of how the underlying assets performed.
          </p>
          <p className="text-muted-foreground mt-2">
            <strong>Withdrawal edge case.</strong> Because Net Contribution
            is{" "}
            <code className="bg-muted/40 mx-1 rounded px-1">
              deposits − withdrawals
            </code>
            , a full withdrawal followed by a re-deposit shrinks the
            denominator and inflates the resulting ROI. That's correct
            relative to the "net capital currently invested" framing, but
            it's worth knowing if you've moved money in and out of an
            account.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">
            Sub-periods (1M / 3M / 6M / YTD / 1Y) — TWR{" "}
            {timeRange !== "ALL" && (
              <span className="text-primary text-xs">
                (currently shown: {timeRange})
              </span>
            )}
          </h3>
          <p className="text-muted-foreground">
            Answers:{" "}
            <em>
              "How well did the underlying portfolio perform in this window,
              independent of when I added money?"
            </em>
          </p>
          <p className="text-muted-foreground mt-2">
            Time-Weighted Return chains the sub-returns from the intervals
            between external flows (deposits/withdrawals), then compounds
            them. It's the GIPS-compliant standard for performance
            attribution because it eliminates cash-flow timing distortion.
            Source: the backend's{" "}
            <code className="bg-muted/40 mx-1 rounded px-1">
              performance.calculateSummary
            </code>{" "}
            API.
          </p>
          <p className="text-muted-foreground mt-2">
            <strong>Implementation note.</strong> Strictly, TWR needs a
            sub-return for every interval between external flows plus the
            tail from the last flow to the period end. Most retail backends
            (Wealthfolio included) approximate this with daily valuation
            snapshots — a Modified Dietz-style estimate. For normal-sized
            retail contributions this is essentially indistinguishable from
            a true transaction-date split; it would only drift on large
            intraday flows.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">Why not "Simple Return" for sub-periods?</h3>
          <p className="text-muted-foreground">
            Both candidate formulas fail for the same root reason: they need
            a stable, meaningful capital base in the denominator, and a
            short slice of an irregularly-funded portfolio simply doesn't
            provide one. The two failures are just different symptoms:
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
            <li>
              <code>ROI_period = period_gain / period_contribution</code>:
              denominator is zero whenever you didn't deposit in the window.
            </li>
            <li>
              <code>(end − start − cashflow) / start</code> (Wealthfolio's{" "}
              <code>simple_return</code>): denominator is the value at your
              very first trade, usually tiny — a €200 first trade growing
              into a €6,000 portfolio reports +300% even if assets only
              grew ~10%.
            </li>
          </ul>
          <p className="text-muted-foreground mt-2">
            TWR doesn't divide by any single cash position — it multiplies
            through the per-interval growth factors — so neither failure
            mode applies.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">
            "Net Gain" (account row) vs "Unrealized Gain" (holding row)
          </h3>
          <p className="text-muted-foreground">
            The two columns measure different things and will only coincide for
            buy-and-hold portfolios with no dividends.
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Net Gain</strong> (account) ={" "}
              <code>Total Value − Net Contribution</code>. Captures the total
              economic improvement of the account: unrealized P&amp;L on open
              positions <em>plus</em> realized gains from past sells (now in
              cash) <em>plus</em> dividends and interest received, minus fees.
            </li>
            <li>
              <strong>Unrealized Gain</strong> (holding) ={" "}
              <code>Market Value − Cost Basis</code> of the currently-open
              position only. Excludes anything you've already sold and anything
              that flowed into cash.
            </li>
          </ul>
          <p className="text-muted-foreground mt-2">
            <em>Example:</em> bought 100 shares at €100 (cost €10,000), price
            doubled, sold 50 at €200 (€5,000 realized into cash), still hold 50
            at €200. Holding row shows Unrealized Gain = €5,000 (open lot
            only). Account row shows Net Gain = €10,000 (€5,000 realized +
            €5,000 unrealized).
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">Aggregated TOTAL row caveats</h3>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            <li>
              Money columns are summed linearly in the first account's
              currency — fine when all accounts share a currency, otherwise
              needs fx conversion.
            </li>
            <li>
              For sub-periods, the TOTAL rate is a net-contribution-weighted
              average of per-account TWR. This is a <strong>heuristic</strong>,
              not the true portfolio TWR (which would require chaining
              daily portfolio-level returns). It can diverge meaningfully
              when accounts have very different return profiles and very
              different cash-flow timing. Treat the decimal places as
              indicative — not precise.
            </li>
          </ul>
        </section>
      </CardContent>
      )}
    </Card>
  );
};

// ─── Holdings sub-table ──────────────────────────────────────────────────────

interface HoldingsTableProps {
  ctx: AddonContext;
  accountId: string;
  currency: string;
}

const HoldingsTable: React.FC<HoldingsTableProps> = ({ ctx, accountId, currency }) => {
  const holdingsQuery = useFetch(
    () => ctx.api.portfolio.getHoldings(accountId),
    [accountId],
  );

  if (holdingsQuery.isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (holdingsQuery.error) {
    return (
      <div className="text-destructive text-xs">Error: {holdingsQuery.error.message}</div>
    );
  }

  const holdings = (holdingsQuery.data ?? []).filter(
    (h: Holding) => h.holdingType !== "cash",
  );

  if (holdings.length === 0) {
    return <div className="text-muted-foreground text-xs">No holdings.</div>;
  }

  return (
    <table className="w-full table-fixed text-xs">
      <thead className="text-muted-foreground border-b text-left uppercase tracking-wide">
        <tr>
          <th className="px-2 py-1" style={{ width: "8%" }}>Symbol</th>
          <th className="px-2 py-1" style={{ width: "24%" }}>Name</th>
          <th className="px-2 py-1 text-right" style={{ width: "8%" }}>Quantity</th>
          <th className="px-2 py-1 text-right" style={{ width: "15%" }}>Market Value</th>
          <th className="px-2 py-1 text-right" style={{ width: "15%" }}>Cost Basis</th>
          <th className="px-2 py-1 text-right" style={{ width: "15%" }}>Unrealized Gain</th>
          <th className="px-2 py-1 text-right" style={{ width: "15%" }}>ROI</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h) => {
          const cost = money(h.costBasis);
          const mv = money(h.marketValue);
          const ug = h.unrealizedGain ? money(h.unrealizedGain) : mv - cost;
          const roi = h.unrealizedGainPct ?? (cost !== 0 ? ug / cost : null);
          const symbol = instrumentSymbol(h);
          const name = instrumentName(h);
          return (
            <tr key={h.id} className="border-b last:border-0">
              <td className="truncate px-2 py-1 font-medium" title={symbol}>{symbol}</td>
              <td className="text-muted-foreground truncate px-2 py-1" title={name}>{name}</td>
              <td className="px-2 py-1 text-right">{h.quantity}</td>
              <td className="px-2 py-1 text-right">{fmtMoney(mv, currency)}</td>
              <td className="px-2 py-1 text-right">{fmtMoney(cost, currency)}</td>
              <td className={`px-2 py-1 text-right ${classForReturn(ug)}`}>
                {fmtMoney(ug, currency)}
              </td>
              <td className={`px-2 py-1 text-right font-semibold ${classForReturn(roi)}`}>
                {fmtPct(roi)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
