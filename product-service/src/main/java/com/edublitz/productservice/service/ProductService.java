package com.edublitz.productservice.service;

import com.edublitz.productservice.dto.ProductRequest;
import com.edublitz.productservice.dto.StockUpdateRequest;
import com.edublitz.productservice.exception.BadRequestException;
import com.edublitz.productservice.exception.ResourceNotFoundException;
import com.edublitz.productservice.model.InventoryItem;
import com.edublitz.productservice.model.Product;
import com.edublitz.productservice.repository.InventoryRepository;
import com.edublitz.productservice.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;

    @Value("${stock.low-threshold:10}")
    private int lowStockThreshold;

    public Product createProduct(ProductRequest request) {
        if (productRepository.existsBySkuAndActiveTrue(request.getSku())) {
            throw new BadRequestException("SKU already in use by an active product: " + request.getSku());
        }
        Product product = Product.builder()
                .sku(request.getSku())
                .name(request.getName())
                .genericName(request.getGenericName())
                .description(request.getDescription())
                .manufacturer(request.getManufacturer())
                .category(request.getCategory())
                .type(request.getType())
                .dosageForm(request.getDosageForm())
                .strength(request.getStrength())
                .unit(request.getUnit())
                .mrp(request.getMrp())
                .wholesalePrice(request.getWholesalePrice())
                .prescriptionRequired(request.isPrescriptionRequired())
                .controlledSubstance(request.isControlledSubstance())
                .hsnCode(request.getHsnCode())
                .gstRate(request.getGstRate())
                .drugLicenseNumber(request.getDrugLicenseNumber())
                .distributorId(request.getDistributorId())
                .active(true)
                .build();

        return productRepository.save(product);
    }

    public Page<Product> listProducts(String category, String distributorId, Pageable pageable) {
        boolean hasCategory = category != null && !category.isBlank();
        boolean hasDistributor = distributorId != null && !distributorId.isBlank();

        if (hasCategory && hasDistributor) {
            Product.ProductCategory cat = Product.ProductCategory.valueOf(category.toUpperCase());
            return productRepository.findByCategoryAndDistributorIdAndActiveTrue(cat, distributorId, pageable);
        }
        if (hasCategory) {
            Product.ProductCategory cat = Product.ProductCategory.valueOf(category.toUpperCase());
            return productRepository.findByCategoryAndActiveTrue(cat, pageable);
        }
        if (hasDistributor) {
            return productRepository.findByDistributorIdAndActiveTrue(distributorId, pageable);
        }
        return productRepository.findByActiveTrue(pageable);
    }

    public Product getProductById(String id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    public Product getProductBySku(String sku) {
        return productRepository.findBySkuAndActiveTrue(sku)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with SKU: " + sku));
    }

    public Page<Product> searchProducts(String query, String distributorId, Pageable pageable) {
        if (distributorId != null && !distributorId.isBlank()) {
            return productRepository.searchByNameAndDistributor(query, distributorId, pageable);
        }
        return productRepository.searchByName(query, pageable);
    }

    public Product updateProduct(String id, ProductRequest request, String role, String orgId) {
        Product existing = getProductById(id);
        if (!existing.isActive()) {
            throw new BadRequestException("Cannot update inactive product");
        }
        assertProductWriteAllowed(existing, role, orgId);

        if ("DISTRIBUTOR".equals(role)) {
            request.setDistributorId(orgId);
        }

        if (!existing.getSku().equals(request.getSku()) && productRepository.existsBySkuAndActiveTrue(request.getSku())) {
            throw new BadRequestException("SKU already in use by an active product: " + request.getSku());
        }

        applyProductRequest(existing, request);
        return productRepository.save(existing);
    }

    public void deactivateProduct(String id, String role, String orgId) {
        Product existing = getProductById(id);
        assertProductWriteAllowed(existing, role, orgId);
        existing.setActive(false);
        productRepository.save(existing);
    }

    private void assertProductWriteAllowed(Product product, String role, String orgId) {
        if ("ADMIN".equals(role)) {
            return;
        }
        if ("DISTRIBUTOR".equals(role) && orgId != null && orgId.equals(product.getDistributorId())) {
            return;
        }
        throw new org.springframework.security.access.AccessDeniedException("You do not manage this product");
    }

    private void applyProductRequest(Product target, ProductRequest r) {
        target.setSku(r.getSku());
        target.setName(r.getName());
        target.setGenericName(r.getGenericName());
        target.setDescription(r.getDescription());
        target.setManufacturer(r.getManufacturer());
        target.setCategory(r.getCategory());
        target.setType(r.getType());
        target.setDosageForm(r.getDosageForm());
        target.setStrength(r.getStrength());
        target.setUnit(r.getUnit());
        target.setMrp(r.getMrp());
        target.setWholesalePrice(r.getWholesalePrice());
        target.setPrescriptionRequired(r.isPrescriptionRequired());
        target.setControlledSubstance(r.isControlledSubstance());
        target.setHsnCode(r.getHsnCode());
        target.setGstRate(r.getGstRate());
        target.setDrugLicenseNumber(r.getDrugLicenseNumber());
        target.setApprovalDate(r.getApprovalDate());
        target.setDistributorId(r.getDistributorId());
    }

    public InventoryItem addStock(StockUpdateRequest request, String role, String orgId) {
        Product product = getProductById(request.getProductId());
        if (!product.isActive()) {
            throw new BadRequestException("Cannot add stock for a removed (inactive) product");
        }
        if ("DISTRIBUTOR".equals(role)) {
            if (orgId == null || !orgId.equals(product.getDistributorId())) {
                throw new AccessDeniedException("This product is not in your catalog");
            }
            request.setDistributorId(orgId);
        } else if ("ADMIN".equals(role)) {
            request.setDistributorId(product.getDistributorId());
        }

        return inventoryRepository
                .findByProductIdAndWarehouseIdAndBatchNumber(
                        request.getProductId(), request.getWarehouseId(), request.getBatchNumber())
                .map(existing -> {
                    existing.setQuantityAvailable(existing.getQuantityAvailable() + request.getQuantity());
                    existing.setStatus(computeStatus(existing));
                    return inventoryRepository.save(existing);
                })
                .orElseGet(() -> {
                    InventoryItem item = InventoryItem.builder()
                            .productId(request.getProductId())
                            .productSku(product.getSku())
                            .productName(product.getName())
                            .warehouseId(request.getWarehouseId())
                            .warehouseLocation(request.getWarehouseLocation())
                            .batchNumber(request.getBatchNumber())
                            .manufacturingDate(request.getManufacturingDate())
                            .expiryDate(request.getExpiryDate())
                            .quantityAvailable(request.getQuantity())
                            .quantityReserved(0)
                            .reorderLevel(request.getReorderLevel())
                            .distributorId(request.getDistributorId())
                            .status(InventoryItem.StockStatus.IN_STOCK)
                            .build();
                    return inventoryRepository.save(item);
                });
    }

    public List<InventoryItem> getInventoryForProduct(String productId) {
        return inventoryRepository.findByProductId(productId);
    }

    public List<InventoryItem> getLowStockItems(String role, String orgId) {
        List<InventoryItem> items = inventoryRepository.findLowStockItems();
        if ("DISTRIBUTOR".equals(role) && orgId != null && !orgId.isBlank()) {
            return items.stream()
                    .filter(i -> orgId.equals(i.getDistributorId()))
                    .toList();
        }
        return items;
    }

    public List<InventoryItem> listAllInventoryBatches(String role, String orgId) {
        if ("DISTRIBUTOR".equals(role) && orgId != null && !orgId.isBlank()) {
            return inventoryRepository
                    .findByDistributorIdOrderByProductSkuAscWarehouseIdAscBatchNumberAsc(orgId);
        }
        return inventoryRepository.findAllByOrderByProductSkuAscWarehouseIdAscBatchNumberAsc();
    }

    public List<InventoryItem> getExpiringItems(int daysAhead, String role, String orgId) {
        LocalDate cutoff = LocalDate.now().plusDays(daysAhead);
        List<InventoryItem> items = inventoryRepository.findExpiringBefore(cutoff);
        if ("DISTRIBUTOR".equals(role) && orgId != null && !orgId.isBlank()) {
            return items.stream()
                    .filter(i -> orgId.equals(i.getDistributorId()))
                    .toList();
        }
        return items;
    }

    /**
     * Reserve stock for an order. Called by order-service via API.
     * Allocates across multiple batches/locations (FEFO by expiry) when no single row covers the quantity.
     * Returns false if insufficient sellable stock is available.
     */
    public boolean reserveStock(String productId, String warehouseId, int quantity) {
        if (quantity <= 0) {
            return true;
        }
        List<InventoryItem> candidates = inventoryRepository.findByProductId(productId).stream()
                .filter(i -> warehouseId == null || warehouseId.equals(i.getWarehouseId()))
                .filter(i -> i.getStatus() != InventoryItem.StockStatus.EXPIRED
                        && i.getStatus() != InventoryItem.StockStatus.QUARANTINED)
                .sorted(Comparator.comparing(InventoryItem::getExpiryDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        int remaining = quantity;
        Map<InventoryItem, Integer> plan = new LinkedHashMap<>();
        for (InventoryItem item : candidates) {
            int onHand = item.getQuantityOnHand();
            if (onHand <= 0) {
                continue;
            }
            int take = Math.min(onHand, remaining);
            if (take > 0) {
                plan.put(item, take);
                remaining -= take;
            }
            if (remaining == 0) {
                break;
            }
        }
        if (remaining > 0) {
            return false;
        }
        for (Map.Entry<InventoryItem, Integer> e : plan.entrySet()) {
            InventoryItem item = e.getKey();
            int take = e.getValue();
            item.setQuantityReserved(item.getQuantityReserved() + take);
            item.setStatus(computeStatus(item));
            inventoryRepository.save(item);
        }
        return true;
    }

    /**
     * Release a previously reserved quantity (e.g., order cancelled).
     * Reduces {@code quantityReserved} across batches (largest reserved first) until the amount is released.
     */
    public void releaseReservation(String productId, int quantity) {
        if (quantity <= 0) {
            return;
        }
        List<InventoryItem> rows = inventoryRepository.findByProductId(productId).stream()
                .sorted(Comparator.comparingInt(InventoryItem::getQuantityReserved).reversed())
                .toList();
        int remaining = quantity;
        for (InventoryItem item : rows) {
            if (remaining <= 0) {
                break;
            }
            int reserved = item.getQuantityReserved();
            if (reserved <= 0) {
                continue;
            }
            int release = Math.min(reserved, remaining);
            item.setQuantityReserved(reserved - release);
            item.setStatus(computeStatus(item));
            inventoryRepository.save(item);
            remaining -= release;
        }
    }

    private InventoryItem.StockStatus computeStatus(InventoryItem item) {
        if (item.getExpiryDate() != null && item.getExpiryDate().isBefore(LocalDate.now())) {
            return InventoryItem.StockStatus.EXPIRED;
        }
        int onHand = item.getQuantityOnHand();
        if (onHand <= 0) return InventoryItem.StockStatus.OUT_OF_STOCK;
        if (onHand <= lowStockThreshold) return InventoryItem.StockStatus.LOW_STOCK;
        return InventoryItem.StockStatus.IN_STOCK;
    }
}
