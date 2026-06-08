package com.edublitz.productservice.repository;

import com.edublitz.productservice.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends MongoRepository<Product, String> {

    Optional<Product> findBySkuAndActiveTrue(String sku);

    boolean existsBySkuAndActiveTrue(String sku);

    Page<Product> findByCategoryAndActiveTrue(Product.ProductCategory category, Pageable pageable);

    Page<Product> findByCategoryAndDistributorIdAndActiveTrue(
            Product.ProductCategory category, String distributorId, Pageable pageable);

    Page<Product> findByDistributorIdAndActiveTrue(String distributorId, Pageable pageable);

    Page<Product> findByActiveTrue(Pageable pageable);

    @Query("{ 'name': { $regex: ?0, $options: 'i' }, 'active': true }")
    Page<Product> searchByName(String namePattern, Pageable pageable);

    @Query("{ 'name': { $regex: ?0, $options: 'i' }, 'active': true, 'distributorId': ?1 }")
    Page<Product> searchByNameAndDistributor(String namePattern, String distributorId, Pageable pageable);

    List<Product> findByDistributorId(String distributorId);
}
