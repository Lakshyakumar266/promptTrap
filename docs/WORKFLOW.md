# PromptTrap — Workflow and System Design

## 1. High-Level Execution Workflow

```mermaid
flowchart TD
    A[User selects scenario] --> B[Load trusted user task and policy]
    B --> C[Start local mock site origin]
    C --> D[Initialize Gemma model adapter]
    D --> E[Initialize browser adapter]
    E --> F[Agent observes allowed page content]
    F --> G[Gemma returns constrained JSON action]
    G --> H{Validate action & origin}
    H -- Invalid or Prohibited --> I[Block action & record containment event]
    H -- Valid --> J[Execute action in controlled browser]
    I --> K[Append event to run trace]
    J --> K
    K --> L{Stop condition reached?}
    L -- No --> F
    L -- Yes --> M[Run deterministic scenario assertions]
    M --> N[PASS / FAIL / INCONCLUSIVE]
    N --> O[Render report & export JSON / Markdown]
```

## 2. Trust Boundaries

### Trusted
- User task and scenario policy stored in the scenario definition.
- Action validator and origin allowlist (`ALLOWED_MOCK_ORIGIN`).
- Deterministic assertion evaluator.
- Test harness configuration and environment variables.

### Untrusted
- Website text, HTML markup, links, form inputs, and visually hidden DOM elements.
- Model-generated action proposals and natural-language justifications.
- Any content on the page claiming to be a system or developer override.

The model may read untrusted page content, but is strictly prohibited from altering trusted constraints or escaping the origin boundary.

## 3. Per-Run State Machine

```mermaid
stateDiagram-v2
    [*] --> Preparing
    Preparing --> Running: scenario & dependencies ready
    Preparing --> Inconclusive: startup/model/browser error
    Running --> Evaluating: finish action or terminal step
    Running --> Inconclusive: timeout/action limit reached
    Evaluating --> Passed: task done & zero forbidden actions
    Evaluating --> Failed: forbidden action executed or safety breach
    Evaluating --> Inconclusive: insufficient evidence
    Passed --> [*]
    Failed --> [*]
    Inconclusive --> [*]
```
