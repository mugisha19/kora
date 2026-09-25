# 0004 — Modular monolith with pragmatic hexagonal modules

- Status: Accepted
- Date: 2026-09-25

## Context

Kora has 24 features across identity, portfolio management, delivery, governance, performance and
platform concerns. They share one database and one deployment, but they change for different reasons and
must not grow into a ball of mud. Features publish events that others react to (a task completing rolls up
WBS progress, feeds EVM and the activity feed).

## Decision

**One deployable, split into Spring Modulith application modules.** Each direct sub-package of `com.kora`
is a module. Modules talk to each other through their top-level (public) types and through domain events;
their sub-packages are internal. `ModularityTests` fails the build on cycles or reach-ins.

Planned modules (created when their phase starts):

| Module         | Features                                  | Phase |
| -------------- | ----------------------------------------- | ----- |
| `platform`     | errors, correlation ids, tenancy context, paging, money (shared kernel) | 1 |
| `identity`     | 01 authentication, 23 profile             | 2     |
| `organization` | 02 organizations, 03 members, invitations | 2     |
| `portfolio`    | 04 portfolios, programs, projects; 06 charter | 3 |
| `scope`        | 07 work breakdown structure               | 3     |
| `reporting`    | 05 dashboard read models; 21 exports      | 3, 9  |
| `work`         | 08 tasks and board; 09 backlog and sprints | 4    |
| `schedule`     | 10 dependencies, CPM, baselines           | 5     |
| `governance`   | 11 risks, 12 issues, 13 stakeholders, 14 change requests | 6 |
| `resourcing`   | 15 timesheets, 16 capacity and allocations | 7    |
| `performance`  | 17 earned value management                | 7     |
| `notification` | 18 notifications, activity feed, WebSocket | 8    |
| `audit`        | 19 audit trail                            | 8     |
| `attachment`   | 20 file attachments                       | 8     |
| `demo`         | 22 demo data (only with the `demo` profile) | 9   |

**Inside a module, hexagonal layering:**

```
com.kora.<module>
├── domain        entities, value objects, domain services, events, State/Composite/... patterns
├── application   use cases, ports (interfaces), authorization checks, transactions
└── adapter
    ├── web           REST controllers and DTOs (implement the OpenAPI contract)
    ├── persistence   Spring Data repositories, port implementations
    └── ...           email, storage, messaging
```

Dependencies point inwards only: `adapter → application → domain`. `ArchitectureTest` enforces it.

**Pragmatic, not purist:** domain entities carry JPA mapping annotations (`@Entity`, `@Version`, ...)
instead of being mapped from a separate persistence model. The domain must still not depend on Spring or
on adapters, and business rules live in domain methods, not in services that set fields.

## Alternatives considered

- **Microservices** — independent deployment we don't need, at the cost of distributed transactions,
  network failures and a much heavier local setup. A modular monolith can be split later along the same
  module boundaries.
- **Layered monolith (controller/service/repository packages at the top)** — groups code by technical role,
  so one feature is spread across the whole tree and nothing stops cross-feature coupling.
- **Purist hexagonal with a separate persistence model** — doubles the model classes and adds mapping
  code for every aggregate, with little benefit while PostgreSQL is the only store.

## Consequences

- A module's boundary is checked by the build, not just by convention.
- Events between modules go through Spring Modulith's event publication registry (transactional outbox,
  feature 18), so a module never calls another module's internals.
- Spring Modulith generates C4/UML component diagrams of the modules (`target/spring-modulith-docs`).
