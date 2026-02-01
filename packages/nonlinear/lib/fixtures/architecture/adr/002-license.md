# ADR-002: Mixed License Strategy

## Context

Expressio aims to balance multiple objectives:
- Build an open-source community around i18n tooling
- Protect core commercial interests and IP
- Enable wide adoption of utility components
- Maintain competitive advantage in AI-powered translation

The project needed a licensing strategy that would:
- Encourage contributions to shared utilities
- Prevent direct commercial competition of the core product
- Allow integration into other projects
- Support a future commercial/professional edition

## Decision

Implement a mixed licensing strategy across packages:

- **Core Application (`expressio/`)**: AGPL-3.0
  - Main translation application
  - Business logic and workflows
  - AI integration features
  - CLI tools

- **Utility Packages (`bunchy/`, `common/`)**: MIT
  - Development tooling
  - Shared UI components
  - General-purpose utilities

## Consequences

### Positive
- **Community Building**: MIT utilities encourage adoption and contributions
- **Commercial Protection**: AGPL prevents direct commercialization without reciprocity
- **Ecosystem Growth**: Developers can build on utilities without license concerns
- **Competitive Moat**: Core translation workflows remain protected
- **Future Flexibility**: Supports dual-edition strategy (community + professional)

### Negative
- **Complexity**: Developers must understand two different licenses
- **Boundary Maintenance**: Must carefully consider where features belong
- **Contribution Friction**: Some developers may avoid AGPL components
- **Enforcement Overhead**: Need to monitor license compliance

## Implementation Notes
- Each package contains its own `LICENSE.md` file
- README clearly documents the licensing strategy
- Package boundaries aligned with licensing decisions
- Future features evaluated against license implications

## Future Considerations
- New core features default to AGPL (in `expressio/`)
- New utilities and abstractions default to MIT (in appropriate utility package)
- Consider community feedback on license boundaries
- Monitor for any license compliance issues in the ecosystem