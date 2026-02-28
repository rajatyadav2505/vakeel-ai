import { Annotation, StateGraph } from '@langchain/langgraph';
import type { StrategyOutput } from '@nyaya/shared';
import { runOrchestratedWarGame } from './orchestrator';

const GraphState = Annotation.Root({
  caseId: Annotation<string>(),
  summary: Annotation<string>(),
  objective: Annotation<string>(),
  depth: Annotation<number>(),
  result: Annotation<StrategyOutput | null>(),
});

async function orchestratorNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  return {
    result: await runOrchestratedWarGame({
      caseId: state.caseId,
      summary: state.summary,
      objective: state.objective,
      depth: state.depth,
    }),
  };
}

async function scoreNode(state: typeof GraphState.State) {
  // Placeholder for future proposal scoring enhancements.
  return { result: state.result };
}

export function buildWarRoomGraph() {
  const graph = new StateGraph(GraphState)
    .addNode('orchestrator', orchestratorNode)
    .addNode('score', scoreNode)
    .addEdge('__start__', 'orchestrator')
    .addEdge('orchestrator', 'score')
    .addEdge('score', '__end__');

  return graph.compile();
}
