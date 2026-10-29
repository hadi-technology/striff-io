package com.acme.billing;

public interface PaymentGateway {
    String charge(String customerId, long amountCents);
}
