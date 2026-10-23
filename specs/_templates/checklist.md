# Checklist: <domain> for <feature>

Requirement-quality checks ("unit tests for English"). Each item checks whether the **spec** is complete, clear, and measurable, not whether the code works. Unchecked items block spec approval.

## Completeness

- [ ] <Is X specified for Y?> [REQ-#]

## Clarity

- [ ] <Is "Z" defined with a measurable value?> [REQ-#]

## Consistency

- [ ] <Do REQ-a and REQ-b agree on ...?> [REQ-a, REQ-b]

## Edge cases

- [ ] <Is behavior defined when ...?> [REQ-#]

## Example items by domain

- Security/auth: Are session expiry and lockout rules specified with numbers?
- Data/privacy: Is data retention defined, and who can access what?
- Public API: Are error codes and rate limits specified?
- UX: Are empty, loading, and error states defined for every screen?
