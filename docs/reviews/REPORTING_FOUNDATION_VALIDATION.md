# Reporting Foundation Validation

Validation is performed by the normal repository CI on the exact Draft PR head.

Required gates:

- shared contracts build and tests;
- API TypeScript build;
- migration idempotency;
- full API tests;
- global color contract;
- Admin tests;
- Admin production build.

Manual visual QA remains a separate gate and must not be claimed from code inspection alone.
