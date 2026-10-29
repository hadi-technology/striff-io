package com.acme.checkout.web;

import com.acme.checkout.CheckoutService;
import com.acme.checkout.Receipt;

/** Hands every request to CheckoutService; holds no logic of its own. */
public class CheckoutController {
    private final CheckoutService service;

    public CheckoutController(CheckoutService service) {
        this.service = service;
    }

    public Receipt checkout(String cartId) {
        return service.checkout(cartId);
    }
}
