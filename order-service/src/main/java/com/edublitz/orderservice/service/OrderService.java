package com.edublitz.orderservice.service;

import com.edublitz.orderservice.client.ProductServiceClient;
import com.edublitz.orderservice.dto.CreateOrderRequest;
import com.edublitz.orderservice.exception.BadRequestException;
import com.edublitz.orderservice.exception.ResourceNotFoundException;
import com.edublitz.orderservice.model.Order;
import com.edublitz.orderservice.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductServiceClient productServiceClient;

    private static final AtomicInteger SEQUENCE = new AtomicInteger(10000);

    public Order createOrder(CreateOrderRequest request, String userId, String userEmail,
                             String orgId, String orgName, String bearerToken) {
        List<Order.OrderItem> items = buildOrderItems(request.getItems(), bearerToken);

        BigDecimal subtotal = items.stream()
                .map(Order.OrderItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal gstAmount = items.stream()
                .map(i -> i.getLineTotal().multiply(i.getGstRate()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal total = subtotal.add(gstAmount);

        Order order = Order.builder()
                .orderNumber(generateOrderNumber())
                .buyerOrgId(orgId)
                .buyerOrgName(orgName)
                .distributorOrgId(request.getDistributorOrgId())
                .createdByUserId(userId)
                .createdByEmail(userEmail)
                .items(items)
                .status(Order.OrderStatus.PENDING)
                .subtotal(subtotal)
                .gstAmount(gstAmount)
                .totalAmount(total)
                .shippingAddress(request.getShippingAddress())
                .notes(request.getNotes())
                .build();

        return orderRepository.save(order);
    }

    public Order getOrder(String id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + id));
    }

    public Order getOrderByNumber(String orderNumber) {
        return orderRepository.findByOrderNumber(orderNumber)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderNumber));
    }

    public Page<Order> getOrdersByBuyer(String buyerOrgId, Pageable pageable) {
        return orderRepository.findByBuyerOrgId(buyerOrgId, pageable);
    }

    public Page<Order> getOrdersByDistributor(String distributorOrgId, Pageable pageable) {
        return orderRepository.findByDistributorOrgId(distributorOrgId, pageable);
    }

    public Order approveOrder(String id, String approvedByUserId, String bearerToken,
                              String orgId, String role) {
        Order order = getOrder(id);
        validateTransition(order.getStatus(), Order.OrderStatus.APPROVED);
        assertDistributorMayActOnOrder(order, role, orgId);

        List<Order.OrderItem> reservedSoFar = new ArrayList<>();
        for (Order.OrderItem item : order.getItems()) {
            try {
                boolean reserved = productServiceClient.reserveStock(
                        item.getProductId(), item.getQuantity(), bearerToken);
                if (!reserved) {
                    releaseReservedLineItems(reservedSoFar, bearerToken);
                    throw new BadRequestException(stockShortageMessage(item));
                }
            } catch (WebClientResponseException e) {
                releaseReservedLineItems(reservedSoFar, bearerToken);
                throw new BadRequestException(
                        "Could not reserve inventory for " + item.getProductName()
                                + " (Stock Keeping Unit / SKU: " + item.getProductSku()
                                + "): product service returned HTTP " + e.getStatusCode().value()
                                + ". Check connectivity, JWT configuration, and that stock exists for this product.",
                        e);
            }
            reservedSoFar.add(item);
        }

        order.setStatus(Order.OrderStatus.APPROVED);
        order.setApprovedByUserId(approvedByUserId);
        order.setApprovedAt(Instant.now());
        return orderRepository.save(order);
    }

    public Order rejectOrder(String id, String reason, String rejectedByUserId, String orgId, String role) {
        Order order = getOrder(id);
        validateTransition(order.getStatus(), Order.OrderStatus.REJECTED);
        assertDistributorMayActOnOrder(order, role, orgId);

        order.setStatus(Order.OrderStatus.REJECTED);
        order.setRejectionReason(reason);
        return orderRepository.save(order);
    }

    public Order dispatchOrder(String id, String trackingNumber, String dispatchedByUserId,
                               String orgId, String role) {
        Order order = getOrder(id);
        validateTransition(order.getStatus(), Order.OrderStatus.DISPATCHED);
        assertDistributorMayActOnOrder(order, role, orgId);

        order.setStatus(Order.OrderStatus.DISPATCHED);
        order.setTrackingNumber(trackingNumber);
        order.setDispatchedByUserId(dispatchedByUserId);
        order.setDispatchedAt(Instant.now());

        // Generate invoice on dispatch
        order.setInvoice(generateInvoice(order));

        return orderRepository.save(order);
    }

    public Order confirmDelivery(String id, String confirmedByUserId) {
        Order order = getOrder(id);
        validateTransition(order.getStatus(), Order.OrderStatus.DELIVERED);

        order.setStatus(Order.OrderStatus.DELIVERED);
        order.setDeliveredAt(Instant.now());
        order.setDeliveryConfirmedBy(confirmedByUserId);
        return orderRepository.save(order);
    }

    public Order cancelOrder(String id, String cancelledByUserId, String bearerToken) {
        Order order = getOrder(id);

        if (order.getStatus() == Order.OrderStatus.DISPATCHED
                || order.getStatus() == Order.OrderStatus.DELIVERED) {
            throw new BadRequestException("Cannot cancel an order that has been dispatched or delivered");
        }

        // Release reserved stock if order was approved
        if (order.getStatus() == Order.OrderStatus.APPROVED
                || order.getStatus() == Order.OrderStatus.PROCESSING) {
            order.getItems().forEach(item ->
                    productServiceClient.releaseStock(item.getProductId(), item.getQuantity(), bearerToken));
        }

        order.setStatus(Order.OrderStatus.CANCELLED);
        return orderRepository.save(order);
    }

    private List<Order.OrderItem> buildOrderItems(List<CreateOrderRequest.OrderItemRequest> requests,
                                                   String bearerToken) {
        List<Order.OrderItem> items = new ArrayList<>();
        for (CreateOrderRequest.OrderItemRequest req : requests) {
            Map<String, Object> product = productServiceClient.getProduct(req.getProductId(), bearerToken);
            BigDecimal unitPrice = productServiceClient.getWholesalePrice(product);
            Double gstRate = productServiceClient.getGstRate(product);
            BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(req.getQuantity()));

            items.add(Order.OrderItem.builder()
                    .productId(req.getProductId())
                    .productSku((String) product.get("sku"))
                    .productName((String) product.get("name"))
                    .quantity(req.getQuantity())
                    .unitPrice(unitPrice)
                    .gstRate(BigDecimal.valueOf(gstRate))
                    .lineTotal(lineTotal)
                    .build());
        }
        return items;
    }

    private Order.Invoice generateInvoice(Order order) {
        String invoiceNum = "INV-" + order.getOrderNumber().replace("MED-ORD-", "");
        return Order.Invoice.builder()
                .invoiceNumber(invoiceNum)
                .invoiceDate(Instant.now())
                .subtotal(order.getSubtotal())
                .gstAmount(order.getGstAmount())
                .totalAmount(order.getTotalAmount())
                .paymentTerms("NET-30")
                .paymentStatus("PENDING")
                .build();
    }

    private String generateOrderNumber() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneOffset.UTC)
                .format(Instant.now());
        return "MED-ORD-" + date + "-" + SEQUENCE.incrementAndGet();
    }

    private void assertDistributorMayActOnOrder(Order order, String role, String orgId) {
        if ("ADMIN".equals(role)) {
            return;
        }
        if (orgId == null || !orgId.equals(order.getDistributorOrgId())) {
            throw new AccessDeniedException("This order is not assigned to your distributor organization");
        }
    }

    private void releaseReservedLineItems(List<Order.OrderItem> items, String bearerToken) {
        for (Order.OrderItem item : items) {
            productServiceClient.releaseStock(item.getProductId(), item.getQuantity(), bearerToken);
        }
    }

    private static String stockShortageMessage(Order.OrderItem item) {
        return "Insufficient sellable stock for «" + item.getProductName() + "» (Stock Keeping Unit / SKU: "
                + item.getProductSku() + "). Record at least " + item.getQuantity()
                + " units: open Inventory in the sidebar, click «Add stock (batch)», choose this product, and enter warehouse, batch, expiry, and quantity. Then try approving again.";
    }

    private void validateTransition(Order.OrderStatus current, Order.OrderStatus target) {
        boolean valid = switch (target) {
            case APPROVED -> current == Order.OrderStatus.PENDING;
            case REJECTED -> current == Order.OrderStatus.PENDING;
            case PROCESSING -> current == Order.OrderStatus.APPROVED;
            case DISPATCHED -> current == Order.OrderStatus.APPROVED || current == Order.OrderStatus.PROCESSING;
            case DELIVERED -> current == Order.OrderStatus.DISPATCHED;
            case CANCELLED -> current != Order.OrderStatus.DELIVERED && current != Order.OrderStatus.CANCELLED;
            default -> false;
        };

        if (!valid) {
            throw new BadRequestException(
                    "Cannot transition order from " + current + " to " + target);
        }
    }
}
