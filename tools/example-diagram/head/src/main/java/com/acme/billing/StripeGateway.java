package com.acme.billing;

public class StripeGateway implements PaymentGateway {
    @Override
    public String charge(String customerId, long amountCents) {
        return "ch_" + customerId + "_" + amountCents;
    }
}
