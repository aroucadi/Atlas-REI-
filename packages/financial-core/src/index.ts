/**
 * Financial Core Engine for Atlas REI
 * Contains deterministic financial math formulas to prevent AI hallucinations.
 */

export interface LoanAmortizationInput {
  principal: number;
  annualInterestRate: number; // e.g., 0.05 for 5%
  termMonths: number;
}

export interface LoanPaymentDetails {
  monthlyPayment: number;
  totalPayments: number;
  totalInterestPaid: number;
  amortizationSchedule: Array<{
    month: number;
    payment: number;
    principalPaid: number;
    interestPaid: number;
    remainingBalance: number;
  }>;
}

export interface UnderwritingInput {
  purchasePrice: number;
  grossRentalIncomeAnnual: number;
  operatingExpensesAnnual: number; // e.g. service charges, maintenance, property management, insurance
  downPaymentPct: number; // e.g. 0.25 for 25%
  loanInterestRate?: number; // e.g. 0.05
  loanTermMonths?: number;
}

export interface UnderwritingMetrics {
  grossYield: number;
  netYield: number;
  capRate: number;
  cashOnCashYield: number;
  dscr: number | null; // Debt Service Coverage Ratio
  equityInvested: number;
  monthlyMortgagePayment: number;
}

/**
 * Calculates Gross and Net Rental Yield
 */
export function calculateYield(
  purchasePrice: number,
  rentalIncomeAnnual: number,
  expensesAnnual: number = 0,
): { grossYield: number; netYield: number } {
  if (purchasePrice <= 0) {
    return { grossYield: 0, netYield: 0 };
  }
  const grossYield = rentalIncomeAnnual / purchasePrice;
  const netYield = (rentalIncomeAnnual - expensesAnnual) / purchasePrice;
  return { grossYield, netYield };
}

/**
 * Calculates Capitalization Rate (Cap Rate)
 * Net Operating Income (NOI) / Current Market Value or Purchase Price
 */
export function calculateCapRate(noi: number, value: number): number {
  if (value <= 0) return 0;
  return noi / value;
}

/**
 * Generates Monthly Loan Amortization Schedule and Payment Details
 */
export function calculateAmortization(
  input: LoanAmortizationInput,
): LoanPaymentDetails {
  const { principal, annualInterestRate, termMonths } = input;

  if (principal <= 0 || termMonths <= 0) {
    return {
      monthlyPayment: 0,
      totalPayments: 0,
      totalInterestPaid: 0,
      amortizationSchedule: [],
    };
  }

  // Monthly interest rate
  const monthlyRate = annualInterestRate / 12;

  // Monthly payment calculation
  let monthlyPayment = 0;
  if (monthlyRate === 0) {
    monthlyPayment = principal / termMonths;
  } else {
    monthlyPayment =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  const amortizationSchedule = [];
  let remainingBalance = principal;
  let totalInterestPaid = 0;

  for (let month = 1; month <= termMonths; month++) {
    const interestPaid = remainingBalance * monthlyRate;
    const principalPaid = monthlyPayment - interestPaid;
    remainingBalance = Math.max(0, remainingBalance - principalPaid);
    totalInterestPaid += interestPaid;

    amortizationSchedule.push({
      month,
      payment: Number(monthlyPayment.toFixed(2)),
      principalPaid: Number(principalPaid.toFixed(2)),
      interestPaid: Number(interestPaid.toFixed(2)),
      remainingBalance: Number(remainingBalance.toFixed(2)),
    });
  }

  return {
    monthlyPayment: Number(monthlyPayment.toFixed(2)),
    totalPayments: Number((monthlyPayment * termMonths).toFixed(2)),
    totalInterestPaid: Number(totalInterestPaid.toFixed(2)),
    amortizationSchedule,
  };
}

/**
 * Underwrites a deal dynamically
 */
export function underwriteDeal(input: UnderwritingInput): UnderwritingMetrics {
  const {
    purchasePrice,
    grossRentalIncomeAnnual,
    operatingExpensesAnnual,
    downPaymentPct,
    loanInterestRate,
    loanTermMonths,
  } = input;

  const noi = grossRentalIncomeAnnual - operatingExpensesAnnual;
  const capRate = calculateCapRate(noi, purchasePrice);
  const { grossYield, netYield } = calculateYield(
    purchasePrice,
    grossRentalIncomeAnnual,
    operatingExpensesAnnual,
  );

  const equityInvested = purchasePrice * downPaymentPct;
  const loanPrincipal = purchasePrice - equityInvested;

  let monthlyMortgagePayment = 0;
  let annualDebtService = 0;

  if (
    loanPrincipal > 0 &&
    loanInterestRate !== undefined &&
    loanTermMonths !== undefined
  ) {
    const loanDetails = calculateAmortization({
      principal: loanPrincipal,
      annualInterestRate: loanInterestRate,
      termMonths: loanTermMonths,
    });
    monthlyMortgagePayment = loanDetails.monthlyPayment;
    annualDebtService = monthlyMortgagePayment * 12;
  }

  const cashFlowAnnual = noi - annualDebtService;
  const cashOnCashYield =
    equityInvested > 0 ? cashFlowAnnual / equityInvested : 0;

  const dscr = annualDebtService > 0 ? noi / annualDebtService : null;

  return {
    grossYield: Number(grossYield.toFixed(4)),
    netYield: Number(netYield.toFixed(4)),
    capRate: Number(capRate.toFixed(4)),
    cashOnCashYield: Number(cashOnCashYield.toFixed(4)),
    dscr: dscr === null ? null : Number(dscr.toFixed(2)),
    equityInvested: Number(equityInvested.toFixed(2)),
    monthlyMortgagePayment: Number(monthlyMortgagePayment.toFixed(2)),
  };
}

/**
 * Calculates Internal Rate of Return (IRR) using Newton-Raphson approximation
 * Cash flows must have the initial investment as a negative number at index 0.
 */
export function calculateIRR(cashFlows: number[], guess: number = 0.1): number {
  const maxIterations = 1000;
  const precision = 1e-7;

  let irr = guess;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dNpv = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      const discountFactor = Math.pow(1 + irr, t);
      npv += cashFlows[t] / discountFactor;
      dNpv -= (t * cashFlows[t]) / (discountFactor * (1 + irr));
    }

    if (Math.abs(dNpv) < 1e-12) {
      break;
    }

    const nextIrr = irr - npv / dNpv;

    if (Math.abs(nextIrr - irr) < precision) {
      return Number(nextIrr.toFixed(6));
    }

    irr = nextIrr;
  }

  // Fallback or return approximation
  return Number(irr.toFixed(6));
}
