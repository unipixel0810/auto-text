# 🏗️ Engineering Principles & Architectural Rules

> "Any fool can write code that a computer can understand. Good programmers write code that humans can understand." — Martin Fowler

## 1. Clean Architecture (Structure & Dependencies)

We strictly follow Uncle Bob's Clean Architecture, adapted for high-velocity Flutter development. The dependency rule is absolute: **Source code dependencies can only point inwards.**

### 🌑 Layers Definition

- **`domain/` (The Core)**
  - **Contents**: Entities, Repository Interfaces, Use Case Interfaces.
  - **Constraint**: **ZERO** dependencies on external libraries (except standard Dart or explicit value objects like `equatable`). No Flutter, No Firebase, No APIs.
  - **Why**: This is your business logic in its purest form. It shouldn't break if you swap Flutter for another framework.

- **`application/` (Business Logic)**
  - **Contents**: Use Case Implementations, Application Services.
  - **Constraint**: Depends **only** on the `domain` layer. orchestration of domain entities.
  - **Why**: Captures the "how the app works" logic separately from "how the app looks."

- **`infrastructure/` (Gateways & Data Agents)**
  - **Contents**: Repository Implementations, Data Sources (API calls, DB queries), External Service Integrations (Firebase, Auth).
  - **Constraint**: Depends on `domain` (to implement interfaces) and `application`.
  - **Why**: Isolates the "dirty" details of the outside world.

- **`presentation/` (UI & UX)**
  - **Contents**: Flutter Widgets, State Management (Riverpod/Bloc Providers), UI Models.
  - **Constraint**: Depends on `application` (to trigger actions) or `domain` (to display data).
  - **Rule**: NO business logic in widgets. Widgets should only know how to render state and notify events.

---

## 2. Clean Code (The "Silicon Valley 20-Year CTO" Standard)

### 🧼 The 5 Commandment of Code Health

1.  **SRP (Single Responsibility Principle)**:
    - If a file is > 250 lines, it's screaming for decomposition.
    - Extraction is your best friend. `_buildHelperMethod` is okay, but `MyExtractedWidget` is better.
2.  **Explicit > Implicit**:
    - No "magic strings" or "magic numbers." Use constants or enums.
    - Prefer descriptive function names: `calculateDiscountedPrice()` vs `calc()`.
3.  **Fail Fast & Functional Error Handling**:
    - Do not use `try-catch` for flow control.
    - Use functional types (e.g., `Result<T, E>` or `Either`) to make errors explicit in the type system.
4.  **Immutability by Default**:
    - Use `final` and `@immutable`. State changes should be explicit transitions, not side-effects.
5.  **DAMP over DRY (sometimes)**:
    - Don't over-abstract too early. Code should be **D**escriptive **A**nd **M**aintainable **P**ractices. readability trumps cleverness.

---

## 3. Flutter Specific Standards

- **State Management**: Prefer Riverpod for its robustness and testability.
- **Widget Consistency**: Use the `design_system/` tokens for colors, typography, and spacing. No ad-hoc `Colors.blue` or `EdgeInsets.all(12)`.
- **Navigation**: Use a structured router (e.g., GoRouter) instead of direct `Navigator.push`.

---

## 4. Refactoring Checklist

- [ ] Is this file too big? -> Split it.
- [ ] Is there business logic in the UI? -> Move to UseCase/Provider.
- [ ] Are dependencies pointing inwards? -> Fix the imports.
- [ ] Is the code readable for a junior engineer? -> Simplify.
