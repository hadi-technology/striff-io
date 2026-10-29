package com.acme.checkout;

import com.acme.billing.PaymentGateway;
import com.acme.core.orders.Order;
import com.acme.core.orders.OrderRepository;

public class CheckoutService {
    private final OrderRepository orders;
    private final PaymentGateway payments;

    public CheckoutService(OrderRepository orders, PaymentGateway payments) {
        this.orders = orders;
        this.payments = payments;
    }

    public Receipt checkout(String cartId) {
        Order order = orders.save(new Order(cartId, 0));
        payments.charge(cartId, order.totalCents());
        return new Receipt(order.id(), order.totalCents());
    }
}
