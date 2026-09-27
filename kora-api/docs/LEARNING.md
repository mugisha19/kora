# Learning notes — kora-api

Plain-language explanations of the ideas behind this codebase, written so you can explain them in an
interview. Each phase adds sections.

## Modular monolith (Phase 0)

One application, one deployment, one database, but split into **modules** that each own a business
capability (identity, portfolio, work, governance...). A module exposes a small public API and keeps
everything else internal. Spring Modulith treats each package under `com.kora` as a module and a test
(`ModularityTests`) fails when one module reaches into another's internals or when two modules depend on each
other in a cycle.
**Why it matters:** you get most of the design benefits of microservices (clear ownership, independent
reasoning) without the network, distributed transactions and operational weight.
**Interview line:** "Start with a modular monolith; split out a service only when a module needs to scale
or deploy independently, and the module boundary is already the service boundary."

## Hexagonal architecture (Phase 0)

Also called ports and adapters. The **domain** (business rules) sits in the middle and knows nothing about
HTTP, databases or email. The **application** layer runs use cases and defines **ports**: interfaces for
what it needs from the outside ("save a project", "send an email"). **Adapters** implement those ports
(JPA repository, SMTP sender) or drive the application (REST controller). Dependencies only point inwards.
**Why it matters:** business rules can be unit-tested without Spring or a database, and swapping MinIO for
AWS S3 means writing one adapter.
**Our pragmatic choice:** entities keep their JPA annotations instead of having a separate persistence
model (ADR 0004). An ArchUnit test enforces the direction of dependencies.

## Testcontainers instead of H2 (Phase 0)

Integration tests start a real PostgreSQL 18 in Docker and throw it away afterwards. `@ServiceConnection`
tells Spring Boot the container's URL and password, so tests never hard-code them.
**Why not H2?** It's a different database. Row-level security, `ltree`, JSONB and partitioning don't exist
there, so a test passing on H2 says little about production.
**Detail worth mentioning:** every integration test uses the same `@IntegrationTest` annotation, so Spring
caches one application context and the container starts once per run, not once per class.

## Flyway owns the schema (Phase 0)

Schema changes are versioned SQL files (`V1__...sql`) applied in order and recorded in a history table.
Hibernate is set to `ddl-auto: validate`: it checks that entities match the tables but never changes them.
**Why:** the schema is reviewed like code, every environment gets exactly the same migrations, and nothing
changes the production schema by accident at start-up.

## Quality gates in one command (Phase 0)

`./mvnw verify` runs, in Maven lifecycle order: formatting check (Spotless), static rules (Checkstyle),
compile, unit tests and architecture tests (Surefire), integration tests (Failsafe), then the coverage gate
(JaCoCo). CI runs exactly the same command, so "works on my machine" and "passes CI" mean the same thing.
**Unit vs integration split:** `*Test` classes are fast and need nothing; `*IT` classes start Spring and
PostgreSQL. You can run `./mvnw test` for quick feedback and `./mvnw verify` before committing.

## Virtual threads (Phase 0)

Java 21+ can run each request on a **virtual thread**: a cheap thread managed by the JVM that releases its
carrier thread while it waits on I/O (a database query, an HTTP call). With one property
(`spring.threads.virtual.enabled`) the classic blocking Spring MVC style scales to many concurrent requests
without switching to reactive programming.

## Problem Details and stable error codes (Phase 1)

RFC 9457 defines one JSON shape for HTTP errors: `type`, `title`, `status`, `detail`, `instance`, plus your own
fields. We add `code` (e.g. `members.last_admin`), `correlationId` and `errors[]`. The client never parses the
English `detail`; it looks up `code` in its translation files (English, French, Kinyarwanda). That's what makes
error messages translatable and lets the API reword a message without breaking any screen.
**Interview line:** "Errors are part of the contract: a stable code for machines, a message for humans, and a
correlation id to find the server log."

## 404 vs 403 across tenants (Phase 1)

If user A asks for a project that belongs to another organization, answering `403 Forbidden` tells A the id
exists. Answering `404 Not Found` reveals nothing. So `403` is used only when the caller may know the resource
exists but lacks the role (`access.denied`) or isn't a member of the organization they named in the header.

## Optimistic locking with ETag and If-Match (Phase 1)

Two admins open the organization settings. Both edit and save. Without protection, the second save silently
overwrites the first (a *lost update*). With optimistic locking, every read returns the version (`ETag: "3"`) and
every update must send it back (`If-Match: "3"`). If someone saved in between, the version is now 4 and the API
answers `412 Precondition Failed`; the UI says "someone else saved first" and reloads. It's "optimistic" because
nothing is locked while people edit; conflicts are rare and detected at save time. `428` means the client forgot
`If-Match` altogether, which would otherwise be a silent last-write-wins.

## Correlation ids (Phase 1)

Every request gets an id (the client may supply one). It's in the response header, in every log line of that
request (via SLF4J's MDC) and in every error body. When a user reports an error, the id in the toast leads
straight to the exact server logs. We only accept short ids of safe characters: anything else could inject fake
lines into logs or extra headers into responses.

## Contract-first (Phase 1)

The OpenAPI file was written before any endpoint, agreed with the front end, and is now the source of truth.
The web app generates its client and mocks from it; the API is tested against it. Tests also lint the contract
itself, so conventions (error format, headers, tenant scoping) can't be forgotten on a new endpoint.
**Why not generate the spec from code?** Then the contract only exists after the code, and renaming a Java field
would silently break the client. See ADR 0006.

## Access token + refresh token (Phase 2)

The access token (a signed JWT) proves who you are on every request and expires after 15 minutes. It lives in
JavaScript memory, so a page reload loses it. The refresh token lives in an `HttpOnly` cookie that JavaScript
can't read (so XSS can't steal it) and is only sent to `/api/v1/auth`. On reload, the app calls
`/auth/refresh` and gets a new access token.
**Why two tokens?** A stolen access token is useful for at most 15 minutes. The long-lived credential is never
exposed to scripts.

## Refresh-token rotation and reuse detection (Phase 2)

Every refresh swaps the refresh token for a new one. If an old token ever comes back, someone copied it: the
real browser and the attacker hold the same token and we can't tell who is who, so the whole sign-in (the
token *family*) is revoked and both have to sign in again. A 10-second grace period covers the innocent case of
two tabs refreshing at the same moment.
**Interview line:** "Rotation turns a stolen refresh token into a detectable event instead of a silent,
long-lived session."

## Why login errors are generic, and equally slow (Phase 2)

"No account with this email" versus "wrong password" tells an attacker which emails are registered. So both get
the same message. Timing leaks too: checking an Argon2 hash takes tens of milliseconds, so an unknown email that
skips the check would answer faster. We compare against a dummy hash in that case, so both paths do the same work.

## Argon2id (Phase 2)

Password hashing must be *slow and memory-hungry* on purpose: fast hashes (SHA-256) let attackers test billions
of guesses per second on GPUs. Argon2id needs 19 MiB of memory per attempt, which GPUs are bad at. The salt and
parameters are stored inside each hash, so settings can be raised later.

## Row-level security (Phase 2)

PostgreSQL can attach a filter to a table that it applies to every query by a given role: here
`organization_id = current_setting('app.org')`. The app switches to that restricted role at the start of every
transaction and sets `app.org` to the active organization. Even a hand-written SQL query that forgets
`WHERE organization_id = ?` only sees one tenant's rows.
**Interview line:** "Three layers — header check, ORM tenant filter, database RLS — and each one fails closed on
its own."

## Token bucket rate limiting (Phase 2)

Each key (an IP, an email) has a bucket of N tokens that refills over time; each attempt takes one. When it's
empty the answer is `429` with `Retry-After`. Unlike "N per fixed minute", a bucket has no window edge to exploit
by bursting at 12:00:59 and 12:01:00. Buckets live in Redis so every API instance shares them.

## ScopedValue vs ThreadLocal (Phase 2)

A `ThreadLocal` set for one request and not cleared leaks into the next request that reuses the thread, which
across tenants is a data leak. A `ScopedValue` (final in Java 25) is bound for the duration of one call and
disappears when the call returns, by construction. It also works with virtual threads.

## Portfolio, program, project (Phase 3)

PMI's three levels: a **project** is a temporary endeavour producing a unique result (the mobile banking app); a
**program** groups related projects managed together because they deliver more jointly than separately (all
customer channels); a **portfolio** is everything the organization invests in to meet its strategic objectives,
and is where priorities and trade-offs are decided.

## The charter authorizes the project (Phase 3)

In PMBOK a project formally exists once its charter is approved by the sponsor: purpose, objectives, scope
boundaries, milestones, budget. Kora enforces it: a project can only become `APPROVED` by approving its charter,
and an approved charter can't be edited, only superseded through a change request.

## Composite pattern: the WBS roll-up (Phase 3)

A work package (leaf) and a deliverable (group) implement the same interface: planned effort, planned cost, percent
complete, earned value. The deliverable just asks its children. So a node, a branch and the whole project use one
piece of code. Progress is **weighted by effort**: finishing a 300-hour package moves the needle three times more
than a 100-hour one; a plain average would lie.
**Interview line:** "Composite lets you treat one item and a tree of items the same way, which is exactly what a
roll-up is."

## Read models: CQRS-lite (Phase 3)

The dashboard needs data owned by several modules. Instead of joining across them on every request, a read model
table (`project_snapshots`) is rebuilt from events whenever something changes, in the same transaction, so it is
never stale. Writes go to the owning modules; reads come from a table shaped for the screen.

## Money is not a double (Phase 3)

`0.1 + 0.2` is `0.30000000000000004` in binary floating point. Money uses `BigDecimal`, is scaled to the currency's
minor units (RWF has none, USD has two) and rounds half-even (banker's rounding, which doesn't bias sums upwards).
Amounts travel as decimal *strings* in JSON so no JavaScript client turns them into floats.

## "Today" depends on where you are (Phase 3)

A test failed just after midnight in Kigali: the server compared dates in UTC, where it was still yesterday. Rules
about days (late projects, deadlines, timesheet weeks) must use the organization's time zone. Store instants in
UTC; decide "which day is it" in the user's or organization's zone.

## Lexorank: ordering without renumbering (Phase 4)

Storing positions as 1, 2, 3 means moving a card to the top rewrites every card below it. Lexorank stores a string
per card instead; to put a card between `"b"` and `"c"`, give it `"bi"`. One row changes per move, however long the
column. The price: keys grow when you keep inserting into the same gap, so real systems rebalance occasionally.
**Interview line:** "Fractional indexing with strings: pick a key between the neighbours, write one row."

## Kanban: WIP limits (Phase 4)

A work-in-progress limit caps how many cards a column may hold. When "In review" is full, nobody starts new work;
they help review instead. The limit makes a bottleneck visible and forces the team to finish before starting. Kora
lets a manager override it, because rules that can't bend get worked around, but every override is recorded.

## Scrum: commitment, burndown, velocity (Phase 4)

- A **sprint** is a fixed time box (usually two weeks) with a goal. At the start the team commits to a set of
  backlog items; the **committed points** are frozen then, so later scope changes are visible instead of silently
  moving the goalposts.
- The **burndown** plots the points still open each day against an ideal straight line to zero. Flat stretches
  show blocked work; a line going *up* shows scope added mid-sprint.
- **Velocity** is the points actually completed per sprint. It is a planning tool ("we usually finish 18–24
  points"), not a performance score: comparing teams' velocities is meaningless because each team sizes points its
  own way.

## Physical percent complete from tasks (Phase 4)

A work package's progress is now measured, not guessed: finished tasks count fully, open ones by how much of their
estimate is burnt, weighted by the estimate. That percentage feeds earned value (EV = budget × percent complete), so
EVM in Phase 7 rests on the team's actual task updates.

## The critical path method (Phase 5)

Tasks are nodes and dependencies are arrows. The **forward pass** walks the tasks in dependency order and gives
each its **early start** (ES) and **early finish** (EF = ES + duration): the soonest it can happen. The project
finishes at the latest EF. The **backward pass** walks the other way from that finish and gives each task its
**late start** (LS) and **late finish** (LF): the latest it can happen without moving the project finish.
**Total float** = LS − ES. Tasks with zero float form the **critical path**: any delay on them delays the project.
**Free float** is how far a task can slip before its *next* task has to move. It is often smaller than total float,
because the total float of a chain is shared along it.
**Interview line:** "Forward pass for early dates, backward pass for late dates, float is the difference, and the
zero-float chain is the critical path."

## The four dependency types, lag and lead (Phase 5)

- **FS** (finish to start): pour the concrete, then build the walls. By far the most common.
- **SS** (start to start): testing can start two days after coding starts (SS + 2).
- **FF** (finish to finish): documentation finishes when development finishes.
- **SF** (start to finish): the old system runs until the new one starts. Rare.

**Lag** adds waiting time (let the concrete cure: FS + 3); a **lead** is a negative lag that lets work overlap
(FS − 2).

## Topological sort and loops (Phase 5)

A schedule only exists when the dependencies have no loop ("A before B before C before A" is impossible). **Kahn's
algorithm** keeps taking a task nothing is waiting on; if tasks are left over, they sit on a loop. Checking a new
link is a reachability question: does a path already lead from its successor back to its predecessor? A
breadth-first search answers it and returns the shortest such loop to show the user.

## Baselines and variance (Phase 5)

A **baseline** is a frozen copy of the approved schedule. Progress is judged against it: a task finishing 3 working
days after its baseline finish has a finish variance of +3. Re-planning creates a new baseline rather than
overwriting the old one, so repeated re-planning stays visible.

## Risks vs issues (Phase 6)

A **risk** is uncertain: it *might* happen (the vendor *may* deliver late). An **issue** is certain: it *is*
happening (the vendor *is* late). Risks are scored by **probability × impact** on 1–5 scales. The response depends on
the kind: threats are avoided, mitigated, transferred, accepted or escalated; opportunities are exploited, enhanced,
shared, accepted or escalated. **Inherent** risk is the score before the response; **residual** risk is what is left
once it works. When a risk happens, it *materializes* into an issue.

## The power/interest grid (Phase 6)

Stakeholders are placed by how much power they have over the project and how interested they are in it:
**manage closely** (high, high), **keep satisfied** (high power), **keep informed** (high interest), **monitor**
(low, low). The engagement gap (current UNAWARE…LEADING vs desired) shows who needs attention.

## Integrated change control (Phase 6)

Once baselines are approved, nobody changes scope, schedule or budget directly. A **change request** states the
impact, and the right people approve it depending on its size: the PM always, the PMO above set thresholds, the
sponsor for large or scope-changing ones. Only after the last approval are the baselines updated, all at once.
**Interview line:** "Chain of Responsibility instead of a growing if/else: each approval level is a handler that
decides whether it applies and passes the request on."

## Why nobody approves their own request (Phase 6)

Separation of duties: the person asking for money or time must not be the one granting it. When the requester is
the designated approver, the step goes to the next authority (PM → PMO, sponsor → administrator) instead of being
skipped.

## Earned value management (Phase 7)

Three numbers at a date:
- **PV**, planned value: the budget of the work that should be done by now.
- **EV**, earned value: the budget of the work actually done.
- **AC**, actual cost: what that work cost.

Compare them:
- **SV** = EV − PV and **SPI** = EV ÷ PV say whether you are ahead or behind.
- **CV** = EV − AC and **CPI** = EV ÷ AC say whether you are under or over budget.
- Below 1 is bad for both indices. Read them together: SPI 0.8 with CPI 1.2 means slow but cheap (under-staffed?).

**EAC** forecasts the final cost:
- BAC ÷ CPI if today's efficiency continues;
- AC + (BAC − EV) if the overrun was a one-off;
- the composite formula if schedule pressure will also cost money.

**TCPI** is the efficiency needed from now on to finish on budget; above 1.1 it is rarely achievable.
**Interview line:** "EVM turns 'are we on track?' into two ratios: SPI for time, CPI for money, both against the
same baseline."

## Percent-complete methods (Phase 7)

Physical % trusts the team's measurement. 0/100 earns nothing until done: the most conservative, fine for tasks of
a week or two. 50/50 credits half when started. Story points fit Agile, where value is delivered in points. The
method changes EV, so it must be stated next to the numbers, as the API does.

## Timesheets and actual cost (Phase 7)

Only approved hours count as actual cost, costed at the rate valid on the day worked, so a later raise doesn't
rewrite history. Separation of duties again: nobody approves their own time.

## Capacity vs allocation (Phase 7)

Capacity is what a person can give in a week (their hours, less holidays and leave); allocation is what projects have
planned for them. Utilization = allocation ÷ capacity. Over 100% means someone will slip. Under 70% means people are
waiting. Plan by the week, because "40 hours" is fiction in a week with a public holiday.

## The transactional outbox (Phase 8)

The problem is the dual write. "Save the change, then send the message" loses the message if the process dies between
the two. "Send, then save" announces changes that then roll back. The outbox makes the message part of the change: it
is a row written in the same transaction. A relay (here, Spring Modulith after commit, plus resubmission after a
restart) delivers it later. Delivery becomes at least once, so receivers must be idempotent: a unique event key
turns a duplicate into a no-op.

**Interview line:** "Exactly-once delivery is a myth; at-least-once plus idempotent consumers is what you build."

## An audit trail you can trust (Phase 8)

- **Completeness:** audit at the persistence layer, not in services, and opt out explicitly.
- **Atomicity:** write the audit row in the same transaction as the change.
- **Integrity:** the application's database role can't UPDATE or DELETE audit rows, and a hash chain makes any edit
  by someone with more rights detectable.
- **Privacy:** store what changed, not secrets, and keep only the network part of IP addresses.

This is what ISO 27001's logging control and SOC 2's change-management criteria look for.

## Presigned URLs and untrusted uploads (Phase 8)

With presigned URLs, the API hands out a signed, short-lived URL and the client uploads straight to object storage.
The API stays out of the data path (no 25 MB request bodies, no memory pressure) and keeps control: the signature
fixes the method, key, content type and expiry.

Never trust the file name or the declared type. Sniff the bytes: magic numbers, the package layout of Office files,
strict UTF-8 for text. Refuse macros, and always serve downloads as attachments, so an uploaded HTML file can't run
as your site (stored XSS).

## WebSockets and security (Phase 8)

A browser can't put an `Authorization` header on the WebSocket handshake, so authenticate the first STOMP frame
instead, and authorize every subscription exactly like the equivalent REST read. Pushes are best effort. The REST
endpoints stay the source of truth, and a reconnecting client refetches.

## Template Method vs Strategy (Phase 9)

Both vary behaviour.
- **Template Method** fixes an algorithm's skeleton in a base class and lets subclasses fill in steps. `ReportExporter`
  always loads, builds, renders and stores, in that order; formats differ only in how they render.
- **Strategy** swaps a whole algorithm behind an interface chosen at run time, as with the EVM methods.

Rule of thumb: when the steps and their order are the invariant, use Template Method; when the algorithm itself is
the choice, use Strategy.

## CSV and Excel formula injection (Phase 9)

A cell that starts with `=`, `+`, `-` or `@` can be run as a formula when opened. `=HYPERLINK(...)` leaks data;
old DDE payloads ran commands. Exports of user-entered text (risk titles, task names) are the attack surface.

The defence is to mark such text as text. In a CSV, prefix it with an apostrophe. In XLSX, set the cell's quote-prefix
flag: Excel's own "typed with a leading apostrophe", invisible, and it survives editing the cell.

## Streaming large spreadsheets (Phase 9)

A normal POI workbook keeps every cell object in memory: a 100,000-row sheet takes hundreds of megabytes.
`SXSSFWorkbook` keeps a sliding window (here 100 rows) and writes the rest to a compressed temporary file, so memory
is flat whatever the row count.

The trade-off: rows that left the window can't be read or auto-sized again, so column widths come from the first rows.

## Asynchronous jobs for heavy work (Phase 9)

A report can take seconds, and an HTTP request shouldn't. The API validates and authorizes at once (errors come back
synchronously), queues the job through the outbox, and answers 202 with the job's URL.

- A worker does the work under a concurrency limit, as the requester.
- The client polls or waits for a notification.
- Idempotency comes from the job's status: a redelivered event finds it done and does nothing.

## Demo data that can't lie (Phase 9)

Inserting demo rows directly is fast, but it bypasses the rules. A project could be "in progress" without an approved
charter, or show a health its numbers don't support.

Driving the public API instead makes the demo a long end-to-end test: if it runs, the story is consistent. Only true
history, which an API that records "now" can't produce, is backfilled by the module that owns it.

## A javac gotcha: `TypeNotPresentException: Type E not present` (Phases 9–10)

After new source files were added, incremental builds sometimes compiled a record component declared as
`List<@NotNull @Pattern(regexp = LABEL) String>` with the generic signature `List<E>`. Every request using it then
failed in Bean Validation. A clean build compiled it correctly, so CI never saw it, but local builds kept hitting it.

The trigger was a type annotation on a type argument whose attribute referenced a constant. A composed constraint
(`@TaskLabel`, which carries its own `@Pattern`) removes the constant from the type argument, and the signature is
stable.

If reflection reports a type variable that the class doesn't declare, read the bytecode
(`javap -v ... | grep Signature`) before suspecting libraries.

## Paused test contexts and cached clients (Phase 9)

Spring's test framework caches application contexts. Since Spring Framework 7, it also *pauses* the ones not in use:
their lifecycle beans stop, then start again when a test needs the context back.

A bean that captured a client once breaks across that cycle. Our rate limiter kept the Redis client of a connection
factory that shut it down on stop and created a new one on start, so every request after the demo profile's context
ran failed with "Connection is closed".

Ask the factory for its current client instead of keeping one. Restarts are real in production too.

## Scanning what ships (Phase 10)

Dependency pins in the POM say what we asked for. The image is what runs: the JRE, the OS packages and every
transitive jar.

Scanning the built image (Trivy, CRITICAL, only issues with a fix) found three critical vulnerabilities in the
embedded Tomcat version the framework managed. The fix was one property (`tomcat.version`), with a comment saying
when to remove it.

Fail the build only on what you can act on: "critical and fixed" keeps the gate meaningful instead of noisy.

## One id per request (Phase 10)

A correlation id in the logs, an audit trail, error responses and distributed traces is only useful if it is the
same id everywhere. Reusing the W3C trace id as the default correlation id means a support ticket quoting the id from
an error message leads straight to the logs, the audit entries and the trace of that request.

