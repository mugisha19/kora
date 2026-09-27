# syntax=docker/dockerfile:1
# The Kora API image (Phase 10). Build from kora-api/:  docker build -t kora-api .
# Tests are not run here: CI runs `./mvnw verify` before it builds the image.

# ---- build: compile, package, and split the jar into layers ------------------------------------------------------
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY config/ config/
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw -B -ntp -q package -DskipTests -Dspotless.check.skip=true -Dcheckstyle.skip=true -Djacoco.skip=true \
    && java -Djarmode=tools -jar target/kora-api-*.jar extract --layers --launcher --destination extracted

# ---- runtime: a JRE, a non-root user, and the layers from least to most often changed ---------------------------
FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S kora && adduser -S -G kora kora
WORKDIR /app
COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./
USER kora

# 8080 is the API; the actuator (health, Prometheus metrics) listens on 8081 only, which isn't published to the
# internet (feature 24: actuator locked down).
EXPOSE 8080 8081
ENV MANAGEMENT_SERVER_PORT=8081 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=6 \
    CMD wget -qO- "http://localhost:${MANAGEMENT_SERVER_PORT}/actuator/health/readiness" > /dev/null || exit 1
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
