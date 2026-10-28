// Read-only Agent requests are scoped to the visible view.
export const READ_PATHS={
 workspace:[],
 runtime:['/api/ai-analysis/growth-agent/status','/api/ai-analysis/growth-agent/briefs?limit=7','/api/ai-analysis/growth-agent/learning'],
 governance:['/api/growth-agent/research/questions','/api/growth-agent/prompts/candidates','/api/growth-agent/research/questions?status=approved']
}
export const readPathsForTab=tab=>READ_PATHS[tab]||READ_PATHS.workspace
