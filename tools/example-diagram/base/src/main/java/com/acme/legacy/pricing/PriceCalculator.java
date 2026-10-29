package com.acme.legacy.pricing;

/** Pre-2024 pricing. New code uses core.pricing. */
public class PriceCalculator {
    public double withTax(long cents, double rate) {
        return cents * (1 + rate) / 100.0;
    }

    public String display(long cents) {
        return "$" + (cents / 100.0);
    }
}
