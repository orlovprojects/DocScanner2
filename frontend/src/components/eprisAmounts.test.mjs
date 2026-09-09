import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedDeduction, vatRateLabel } from "./eprisAmounts.js";

test("typing a decimal point becomes a comma and updates the other field", () => {
  const half = linkedDeduction({}, "deduction_percent", "50.5", "200.00");
  assert.equal(half.deduction_percent, "50,5");
  assert.equal(half.deductible_vat, "101,00");
  const amount = linkedDeduction(half, "deductible_vat", "30.25", "200.00");
  assert.equal(amount.deductible_vat, "30,25");
  assert.equal(amount.deduction_percent, "15,12");
});

test("refund cannot exceed invoice VAT, including decimal boundary", () => {
  assert.equal(linkedDeduction({}, "deductible_vat", "100.01", "100"), null);
  assert.equal(linkedDeduction({}, "deduction_percent", "100.01", "100"), null);
  assert.equal(linkedDeduction({}, "deductible_vat", "-1", "100"), null);
  assert.equal(linkedDeduction({}, "deductible_vat", "1", "0"), null);
  assert.equal(linkedDeduction({}, "deductible_vat", "12,34", "12.34").deduction_percent, "100,00");
});

test("editing remains possible while an input is temporarily empty", () => {
  const details = { deduction_percent: "100", deductible_vat: "100,00" };
  assert.equal(linkedDeduction(details, "deduction_percent", "", "100").deduction_percent, "");
  assert.equal(linkedDeduction(details, "deduction_percent", "50,", "100").deductible_vat, "50,00");
});

test("activity coefficient limits amounts without changing the exact amount to its rounded percentage", () => {
  assert.equal(linkedDeduction({ prorata_rate: "50" }, "deductible_vat", "60", "100"), null);
  const details = linkedDeduction({}, "deductible_vat", "33333.34", "99999.99");
  assert.equal(details.deductible_vat, "33333,34");
  assert.equal(details.deduction_percent, "33,33");
});

test("mixed, unknown and zero rates remain distinct", () => {
  assert.equal(vatRateLabel({ separate_vat: true, vat_percent: 21 }), "Keli skirtingi");
  assert.equal(vatRateLabel({ vat_percent: null }), "—");
  assert.equal(vatRateLabel({ vat_percent: 0 }), "0 %");
});

test("half-cent rounding matches the server's decimal rounding", () => {
  assert.equal(linkedDeduction({}, "deduction_percent", "50", "1.01").deductible_vat, "0,50");
  assert.equal(linkedDeduction({}, "deduction_percent", "50", "1.03").deductible_vat, "0,52");
  assert.equal(linkedDeduction({ prorata_rate: "50" }, "deductible_vat", "0,51", "1.01"), null);
});
