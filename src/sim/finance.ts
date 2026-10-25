import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import { DIFFICULTIES } from './difficulty';
import type { Loan } from './stewardState';
import type { SimCtx } from './systems';

/** Loan term in sim seconds. */
export const LOAN_TERM = 600;
export const LOAN_SIZES = [5000, 15000, 40000] as const;

/** How much more the city may borrow: ~10 sim-minutes of gross income, at least 5 000. */
export function creditLimit(city: City): number {
  const owed = city.steward.loans.reduce((a, l) => a + l.remaining, 0);
  return Math.max(0, Math.max(5000, city.stats.income * 600) - owed);
}

export function totalDebt(city: City): number {
  return city.steward.loans.reduce((a, l) => a + l.remaining, 0);
}

/**
 * Once per pulse: service loans, then set funding. A treasury below zero forces austerity:
 * only 40% of upkeep is paid, which makes buildings and highways decay (see `upkeep.ts`).
 */
export function updateFinance(city: City, upkeep: number): number {
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
  st.funding = city.credits < 0 ? 0.4 : 1;
  const charged = upkeep * st.funding;
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
      const rate = DIFFICULTIES[city.steward.difficulty].interest;
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
