package com.acme.checkout;

public class Receipt {
    private final String orderId;
    private final long totalCents;

    public Receipt(String orderId, long totalCents) {
        this.orderId = orderId;
        this.totalCents = totalCents;
    }

    public String orderId() { return orderId; }
    public long totalCents() { return totalCents; }
}
