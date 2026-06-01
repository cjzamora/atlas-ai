# React + Nest Demo Fixture

This fixture repo exists to exercise Atlas against a realistic full-stack code graph.

It models three workflows:

- auth
- checkout with coupon pricing
- notifications after order placement

Structure:

- `apps/web`: React-style frontend
- `apps/api`: Nest-style backend
- `packages/shared`: shared DTOs and types
- `tests`: repo-level integration-oriented tests

It is intentionally lightweight and optimized for Atlas indexing rather than runtime completeness.
