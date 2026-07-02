/**
 * Jest Setup File
 *
 * Unit tests legitimately use AI Gateway mock/simulation mode — they test
 * business logic (database queries, routing, workspace guards), not LLM
 * response quality. Setting ALLOW_MOCK_GATEWAY=true makes this explicit
 * and honest, rather than silently falling through to simulation.
 */
process.env.ALLOW_MOCK_GATEWAY = 'true';
