package com.acme.core.orders;

public class Order {
    private final String id;
    private final long totalCents;

    public Order(String id, long totalCents) {
        this.id = id;
        this.totalCents = totalCents;
    }

    public String id() { return id; }
    public long totalCents() { return totalCents; }
}
