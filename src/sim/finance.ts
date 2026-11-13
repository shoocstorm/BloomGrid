import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import { DIFFICULTIES } from './difficulty';
import type { Loan } from './stewardState';
import { INCOME_SCALE } from './pulseConst';
import { BUDGET_SECTORS, type BudgetSector } from './policyState';
import type { SimCtx } from './systems';

/** Loan term in sim seconds. */
export const LOAN_TERM = 600;
export const LOAN_SIZES = [5000, 15000, 40000] as const;

/**
 * Credits gained (or lost) per sim second: taxes, fishing, visitors and fireworks (net, smoothed) in; insurance, upkeep
 * (at the current funding) and loan repayments out. The one formula for credit flow: the top bar, City Pulse, the dashboard, the stat guide
 * and Flora all show this number, and it is what `credits` actually moves by.
 */
export function netIncome(city: City): number {
  const s = city.stats;
  return s.income + s.fishing + s.tourism + s.fireworks - s.insurance - s.upkeep - s.debtService - s.policyCost;
}

/** How much more the city may borrow: ~10 sim-minutes of gross income, at least 5 000. */
export function creditLimit(city: City): number {
  const owed = city.steward.loans.reduce((a, l) => a + l.remaining, 0);
  return Math.max(0, Math.max(5000, city.stats.income * 600) - owed);
}

export function totalDebt(city: City): number {
  return city.steward.loans.reduce((a, l) => a + l.remaining, 0);
}

/** Austerity: the share of upkeep a city in debt can pay. */
export const AUSTERITY = 0.4;

/**
 * Once per pulse: service loans, then pay upkeep by sector (plan v5): each sector's budget share (`policies.budget`)
 * times austerity. A treasury below zero forces austerity: only 40% is paid, so buildings and highways decay
 * (see `upkeep.ts`). `steward.funding` is the maintenance sector's effective share (what condition and roads read).
 * Returns loan repayments; `upkeep` (sector → designed upkeep) comes back as paid in `stats.upkeep`.
 */
/** Tax from residents and from workplaces this pulse (credits/s), as the pulse books them (plan v5: two rates). */
export function taxSplit(city: City): { residents: number; business: number } {
  const s = city.stats;
  return {
    residents: s.population * 0.6 * city.pulse.taxRate * INCOME_SCALE,
    business: s.employed * 0.4 * city.policies.businessRate * city.consequences.mods.workerTax * INCOME_SCALE,
  };
}

/** Share of a sector's designed upkeep the city pays now: its budget, times austerity in debt. */
export function paidShare(city: City, sector: BudgetSector): number {
  return city.policies.budget[sector] * (city.credits < 0 ? AUSTERITY : 1);
}

export function updateFinance(city: City, upkeep: Record<BudgetSector, number>): number {
  const st = city.steward;
  let paid = 0;
  for (let i = st.loans.length - 1; i >= 0; i--) {
    const l = st.loans[i]!;
    const p = Math.min(l.payment, l.remaining);
    l.remaining -= p;
    paid += p;
    if (l.remaining <= 0.01) {
      st.loans.splice(i, 1);
      city.bus.emit('loan:repaid', { id: l.id });
    }
  }
  const austerity = city.credits < 0 ? AUSTERITY : 1;
  const b = city.policies.budget;
  st.funding = b.maintenance * austerity;
  let charged = 0;
  for (const k of BUDGET_SECTORS) charged += upkeep[k] * b[k] * austerity;
  city.stats.upkeep = charged;
  city.credits -= charged + paid;
  return paid;
}

export interface LoanPayload {
  amount: number;
}

export function registerFinanceCommands(stack: CommandStack<SimCtx>): void {
  stack.register<LoanPayload, Loan>('takeLoan', {
    apply({ city }, p) {
      if (p.amount <= 0 || p.amount > creditLimit(city)) return null;
      // A falling credit rating makes borrowing dearer (consequences, D-074).
      const rate = DIFFICULTIES[city.steward.difficulty].interest + city.consequences.mods.interest;
      const total = p.amount * (1 + rate * (LOAN_TERM / 60));
      const loan: Loan = { id: city.steward.nextLoanId++, principal: p.amount, remaining: total, payment: total / LOAN_TERM };
      city.steward.loans.push(loan);
      city.credits += p.amount;
      return loan;
    },
    revert({ city }, _p, loan) {
      const i = city.steward.loans.findIndex((l) => l.id === loan.id);
      if (i >= 0) city.steward.loans.splice(i, 1);
      city.credits -= loan.principal;
    },
  });

  stack.register<{ id: number }, Loan>('repayLoan', {
    apply({ city }, p) {
      const i = city.steward.loans.findIndex((l) => l.id === p.id);
      const loan = city.steward.loans[i];
      if (!loan || city.credits < loan.remaining) return null;
      city.credits -= loan.remaining;
      city.steward.loans.splice(i, 1);
      return { ...loan };
    },
    revert({ city }, _p, loan) {
      city.steward.loans.push(loan);
      city.steward.loans.sort((a, b) => a.id - b.id);
      city.credits += loan.remaining;
    },
  });
}
