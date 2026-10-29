package com.acme.core.orders;

import java.util.List;

public interface OrderRepository {
    Order save(Order order);
    List<Order> findByCustomer(String customerId);
}
