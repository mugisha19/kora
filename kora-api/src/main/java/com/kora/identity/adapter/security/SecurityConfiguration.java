package com.kora.identity.adapter.security;

import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.UnauthenticatedException;
import com.kora.platform.web.ProblemResponseWriter;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

/**
 * Stateless API security: every request is authenticated by its bearer access token (JWT), nothing is stored in an
 * HTTP session, and failures are answered in the contract's Problem Details shape.
 *
 * <p>CSRF protection is off because no endpoint authenticates with an ambient credential except the refresh cookie,
 * which is {@code SameSite=Strict} and only accepted on {@code /auth/refresh} and {@code /auth/logout}.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

    /** Endpoints anyone may call: signing in and following an invitation link. */
    static final List<String> PUBLIC_PATH_PREFIXES = List.of("/api/v1/auth/", "/api/v1/invitations/token/");

    private static final String[] OPERATIONS_ENDPOINTS = {
        "/actuator/health", "/actuator/health/**", "/actuator/info", "/actuator/prometheus"
    };

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, JwtDecoder jwtDecoder, ProblemResponseWriter problems) {
        AuthenticationEntryPoint unauthenticated = (request, response, exception) -> problems.write(
                request,
                response,
                new UnauthenticatedException(PlatformErrorCodes.UNAUTHENTICATED, "Sign in to continue"));
        AccessDeniedHandler accessDenied = (request, response, exception) ->
                problems.write(request, response, new ForbiddenException("You don't have permission to do this"));

        http.csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(PUBLIC_PATH_PREFIXES.stream()
                                .map(prefix -> prefix + "**")
                                .toArray(String[]::new))
                        .permitAll()
                        .requestMatchers(OPERATIONS_ENDPOINTS)
                        .permitAll()
                        .requestMatchers("/error")
                        .permitAll()
                        // The WebSocket handshake: STOMP CONNECT carries the token instead (notifications module).
                        .requestMatchers("/ws", "/ws/**")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.decoder(jwtDecoder))
                        .bearerTokenResolver(new PublicPathsBearerTokenResolver())
                        .authenticationEntryPoint(unauthenticated)
                        .accessDeniedHandler(accessDenied))
                .exceptionHandling(exceptions ->
                        exceptions.authenticationEntryPoint(unauthenticated).accessDeniedHandler(accessDenied));
        return http.build();
    }

    @Bean
    JwtKeys jwtKeys(JwtProperties properties) {
        return JwtKeys.from(properties);
    }

    @Bean
    JwtEncoder jwtEncoder(JwtKeys keys) {
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keys.signingKey())));
    }

    /** Accepts ES256 tokens signed by the current or a previous key, from our issuer, not expired. */
    @Bean
    JwtDecoder jwtDecoder(JwtKeys keys, JwtProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSource(new ImmutableJWKSet<>(keys.verificationKeys()))
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(properties.issuer()));
        return decoder;
    }
}
