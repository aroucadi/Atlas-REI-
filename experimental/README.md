# Experimental Capabilities (Quarantined)

This directory contains unverified/non-functional research code and mock implementations corresponding to prior release capability claims. These capabilities are **EXCLUDED** from the production build, main code execution path, and "Definition of Done" capability claims.

## Quarantined Capabilities

1. **Governed Model Fine-Tuning Container**:
   - Files: `experimental/fine-tuning/model-finetuning.service.ts`
   - Status: Non-functional research code (does not perform weight updates; only runs basic JSONL format validation inside a mock container execution).
   
2. **Ragas Evaluation Wrapper**:
   - Files: `experimental/ragas/ragas-eval.spec.ts`
   - Status: Mock word-overlap based logic, not actual Ragas framework integration.

3. **Fake SAML/SSO scaffolding**:
   - Status: Banned/Removed. No corporate SAML/OIDC SSO or Identity Provider integration code exists in the active codebase.

4. **Fake gRPC federation**:
   - Status: Banned/Removed. No federated gRPC messaging or communication is implemented.

5. **Fake Raft/Paxos consensus**:
   - Status: Banned/Removed. The only working multi-agent negotiation is a local, sequential ReAct critique loop in `apps/api/src/agent/consensus-coordinator.service.ts`. It does not use distributed Paxos/Raft consensus.

6. **Fake Z3/OPA plan validation**:
   - Status: Banned/Removed. Simple DFS cycle-detection in `apps/api/src/agent/goal.service.ts` is the only active objective tree checking. No symbolic solvers or Rego policy engines are present.

7. **Fake websocket/Slack clarification gateways**:
   - Status: Banned/Removed. No Slack integration or WebSocket gate exists in the code.
