package com.acme.checkout;

import com.acme.billing.PaymentGateway;
import com.acme.checkout.export.CsvExporter;
import com.acme.core.orders.Order;
import com.acme.core.orders.OrderRepository;

public class CheckoutService {
    private final OrderRepository orders;
    private final PaymentGateway payments;
    private final CsvExporter exporter;

    public CheckoutService(OrderRepository orders, PaymentGateway payments, CsvExporter exporter) {
        this.orders = orders;
        this.payments = payments;
        this.exporter = exporter;
    }

    public Receipt checkout(String cartId) {
        Order order = orders.save(new Order(cartId, 0));
        payments.charge(cartId, order.totalCents());
        return new Receipt(order.id(), order.totalCents());
    }

    public String exportOrders(String customerId) {
        return exporter.export(orders.findByCustomer(customerId));
    }
}
