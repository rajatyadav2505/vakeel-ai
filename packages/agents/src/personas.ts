import type { AgentPersona } from '@nyaya/shared';

export const AGENT_POOL: AgentPersona[] = [
  { id: 'p1', name: 'Aarav Sen', corporation: 'LexForge', cluster: 'litigation', role: 'Lead Trial Planner', tools: ['simulate_branch', 'generate_arguments'] },
  { id: 'p2', name: 'Meera Nair', corporation: 'LexForge', cluster: 'litigation', role: 'Cross-Examination Architect', tools: ['simulate_branch', 'detect_contradictions'] },
  { id: 'p3', name: 'Kabir Rao', corporation: 'LexForge', cluster: 'research', role: 'Precedent Miner', tools: ['search_kanoon', 'cite_bare_act'] },
  { id: 'p4', name: 'Sana Khanna', corporation: 'LexForge', cluster: 'research', role: 'Statutory Interpretation Specialist', tools: ['cite_bare_act'] },
  { id: 'p5', name: 'Ira Das', corporation: 'JurisShield', cluster: 'forensics', role: 'Evidence Integrity Analyst', tools: ['validate_evidence', 'simulate_branch'] },
  { id: 'p6', name: 'Rohan Pillai', corporation: 'JurisShield', cluster: 'forensics', role: 'Digital Record Analyst', tools: ['validate_evidence', 'compute_confidence'] },
  { id: 'p7', name: 'Ananya Iyer', corporation: 'JurisShield', cluster: 'negotiation', role: 'Settlement Structure Lead', tools: ['apply_chanakya_principles', 'calculate_game_theory'] },
  { id: 'p8', name: 'Vikram Bhat', corporation: 'JurisShield', cluster: 'negotiation', role: 'Adversarial Negotiation Specialist', tools: ['calculate_game_theory', 'simulate_branch'] },
  { id: 'p9', name: 'Prisha Menon', corporation: 'BenchMind', cluster: 'judicial', role: 'Bench Preference Mapper', tools: ['simulate_branch'] },
  { id: 'p10', name: 'Dev Kapoor', corporation: 'BenchMind', cluster: 'judicial', role: 'Relief Calibration Specialist', tools: ['calculate_game_theory'] },
  { id: 'p11', name: 'Tanmay Joshi', corporation: 'BenchMind', cluster: 'judicial', role: 'Order Pattern Analyst', tools: ['search_kanoon'] },
  { id: 'p12', name: 'Pooja Verma', corporation: 'BenchMind', cluster: 'compliance', role: 'DPDP & Audit Compliance', tools: ['audit_log_write'] },
  { id: 'p13', name: 'Harsh Sethi', corporation: 'ChanakyaWorks', cluster: 'strategy', role: 'Saam Strategist', tools: ['apply_chanakya_principles'] },
  { id: 'p14', name: 'Lavanya Gupta', corporation: 'ChanakyaWorks', cluster: 'strategy', role: 'Daam Strategist', tools: ['apply_chanakya_principles'] },
  { id: 'p15', name: 'Reyansh Malik', corporation: 'ChanakyaWorks', cluster: 'strategy', role: 'Dand Strategist', tools: ['apply_chanakya_principles', 'simulate_branch'] },
  { id: 'p16', name: 'Nisha Arora', corporation: 'ChanakyaWorks', cluster: 'strategy', role: 'Bhed Strategist', tools: ['apply_chanakya_principles', 'detect_contradictions'] },
  { id: 'p17', name: 'Ritika Jain', corporation: 'GameCore', cluster: 'strategy', role: 'Payoff Matrix Optimizer', tools: ['calculate_game_theory', 'simulate_branch'] },
  { id: 'p18', name: 'Arjun Mehta', corporation: 'GameCore', cluster: 'strategy', role: 'Monte-Carlo Branch Scorer', tools: ['simulate_branch', 'calculate_game_theory'] },
  { id: 'p19', name: 'Neel Sharma', corporation: 'GameCore', cluster: 'orchestrator', role: 'Debate Coordinator', tools: ['score_proposals', 'spawn_agents'] },
  { id: 'p20', name: 'Diya Bhalla', corporation: 'GameCore', cluster: 'orchestrator', role: 'Final Strategy Synthesizer', tools: ['rank_strategy', 'generate_formatted_petition'] },
];
