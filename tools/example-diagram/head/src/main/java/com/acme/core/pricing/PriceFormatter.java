package com.acme.core.pricing;

public class PriceFormatter {
    public String format(long cents, String currency) {
        return String.format("%s %d.%02d", currency, cents / 100, cents % 100);
    }
}
