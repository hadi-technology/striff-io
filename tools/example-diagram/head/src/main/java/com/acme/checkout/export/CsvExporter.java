package com.acme.checkout.export;

import com.acme.core.orders.Order;
import com.acme.legacy.pricing.PriceCalculator;

import java.util.List;

public class CsvExporter {
    private final PriceCalculator prices = new PriceCalculator();

    public String export(List<Order> orders) {
        StringBuilder csv = new StringBuilder("order,total\n");
        for (Order order : orders) {
            csv.append(order.id()).append(',').append(prices.display(order.totalCents())).append('\n');
        }
        return csv.toString();
    }
}
