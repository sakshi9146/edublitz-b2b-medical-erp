package com.edublitz.userservice.config;

import com.edublitz.userservice.model.Organization;
import com.edublitz.userservice.model.Organization.Address;
import com.edublitz.userservice.model.Organization.OrganizationType;
import com.edublitz.userservice.model.User;
import com.edublitz.userservice.model.User.Role;
import com.edublitz.userservice.repository.OrganizationRepository;
import com.edublitz.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Runs once at startup to seed a default organization and ADMIN user so the
 * system is immediately usable without any manual DB intervention.
 *
 * Fully idempotent — skips seeding if an ADMIN user already exists.
 *
 * Credentials are configurable via environment variables:
 *   SEED_ADMIN_EMAIL    (default: admin@medicalerp.com)
 *   SEED_ADMIN_PASSWORD (default: Admin@123456)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer {

    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${seed.admin.email:admin@medicalerp.com}")
    private String adminEmail;

    @Value("${seed.admin.password:Admin@123456}")
    private String adminPassword;

    @Value("${seed.org.name:MedERP HQ}")
    private String seedOrgName;

    @Value("${seed.org.registration-number:HQ-0001}")
    private String seedOrgRegNumber;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        // Skip entirely if any ADMIN already exists
        if (!userRepository.findByRole(Role.ADMIN).isEmpty()) {
            log.info("[DataInitializer] Admin user already exists — skipping seed.");
            return;
        }

        log.info("[DataInitializer] No admin found — seeding default organization and admin user...");

        // ── 1. Create or reuse seed organization ───────────────────────────────
        Organization org = organizationRepository
                .findByRegistrationNumber(seedOrgRegNumber)
                .orElseGet(() -> {
                    Organization newOrg = Organization.builder()
                            .name(seedOrgName)
                            .registrationNumber(seedOrgRegNumber)
                            .type(OrganizationType.DISTRIBUTOR)
                            .address(Address.builder()
                                    .street("1 Admin Street")
                                    .city("Mumbai")
                                    .state("MH")
                                    .pincode("400001")
                                    .country("India")
                                    .build())
                            .contactEmail(adminEmail)
                            .contactPhone("+91-0000000000")
                            .active(true)
                            .build();
                    Organization saved = organizationRepository.save(newOrg);
                    log.info("[DataInitializer] Seed organization created: {} (id={})", saved.getName(), saved.getId());
                    return saved;
                });

        // ── 2. Create the ADMIN user ────────────────────────────────────────────
        User admin = User.builder()
                .email(adminEmail)
                .password(passwordEncoder.encode(adminPassword))
                .firstName("System")
                .lastName("Admin")
                .role(Role.ADMIN)
                .organizationId(org.getId())
                .active(true)
                .emailVerified(true)
                .build();

        userRepository.save(admin);

        // ── 3. Print credentials to logs so the operator knows ─────────────────
        log.warn("╔══════════════════════════════════════════════════════╗");
        log.warn("║           DEFAULT ADMIN CREDENTIALS CREATED          ║");
        log.warn("║  Email    : {}  ║", padRight(adminEmail, 38));
        log.warn("║  Password : {}  ║", padRight(adminPassword, 38));
        log.warn("║  Org ID   : {}  ║", padRight(org.getId(), 38));
        log.warn("║  CHANGE THE PASSWORD AFTER FIRST LOGIN!               ║");
        log.warn("╚══════════════════════════════════════════════════════╝");
    }

    private String padRight(String s, int width) {
        if (s == null) s = "";
        return s.length() >= width ? s : s + " ".repeat(width - s.length());
    }
}
