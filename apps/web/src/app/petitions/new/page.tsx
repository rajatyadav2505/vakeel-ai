import { generatePetitionAction } from '@/app/actions/petitions';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getSimulationById } from '@/lib/queries';
import type { StrategyOutput } from '@nyaya/shared';

export default async function PetitionNewPage(props: {
  searchParams: Promise<{ caseId?: string; simulationId?: string; strategyId?: string }>;
}) {
  const searchParams = await props.searchParams;
  let prefills = {
    facts: '',
    legalGrounds: '',
    reliefSought: '',
  };

  if (searchParams.simulationId && searchParams.strategyId) {
    const simulation = await getSimulationById(searchParams.simulationId);
    const strategy = simulation?.strategy_json as StrategyOutput | undefined;
    const cards = strategy?.kautilyaCeres
      ? [
          ...strategy.kautilyaCeres.petitionerStrategies.robust_mode,
          ...strategy.kautilyaCeres.petitionerStrategies.exploit_mode,
          ...strategy.kautilyaCeres.respondentStrategies.robust_mode,
          ...strategy.kautilyaCeres.respondentStrategies.exploit_mode,
        ]
      : [];
    const selected = cards.find((card) => card.id === searchParams.strategyId);
    if (selected) {
      prefills = {
        facts: selected.iracBlocks
          .map((block) => `${block.issue}: ${block.application}`)
          .join('\n\n')
          .slice(0, 5000),
        legalGrounds: selected.iracBlocks
          .map((block) => `${block.rule}\nConclusion: ${block.conclusion}`)
          .join('\n\n')
          .slice(0, 5000),
        reliefSought:
          strategy?.kautilyaCeres?.likelyJudgeOrder.summary
            ?? selected.summary.slice(0, 1000),
      };
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="font-[Georgia] text-xl font-semibold">Petition Generator</h1>
        <p className="text-sm text-muted-foreground">
          Generates structured drafts with citations from Indian Kanoon and statutory anchors.
        </p>
      </div>

      <form action={generatePetitionAction} className="grid gap-4 md:grid-cols-2">
        <Label>
          Case ID
          <Input name="caseId" defaultValue={searchParams.caseId} required />
        </Label>

        <Label>
          Petition type
          <Select name="petitionType" defaultValue="writ">
            <option value="writ">Writ</option>
            <option value="pil">PIL</option>
            <option value="civil_suit">Civil Suit</option>
            <option value="criminal_complaint">Criminal Complaint</option>
            <option value="bail">Bail</option>
            <option value="appeal">Appeal</option>
          </Select>
        </Label>

        <Label>
          Court template
          <Select name="courtTemplate" defaultValue="high_court">
            <option value="district">District</option>
            <option value="high_court">High Court</option>
            <option value="supreme_court">Supreme Court</option>
          </Select>
        </Label>

        <div />

        <Label className="md:col-span-2">
          Facts
          <Textarea name="facts" rows={4} required defaultValue={prefills.facts} />
        </Label>

        <Label className="md:col-span-2">
          Legal grounds
          <Textarea
            name="legalGrounds"
            rows={4}
            required
            defaultValue={prefills.legalGrounds}
          />
        </Label>

        <Label className="md:col-span-2">
          Relief sought
          <Textarea
            name="reliefSought"
            rows={3}
            required
            defaultValue={prefills.reliefSought}
          />
        </Label>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input name="lawyerVerified" type="checkbox" required className="h-4 w-4 rounded border-border accent-primary" />
          Lawyer has reviewed and approved this draft before any export.
        </label>

        <div className="md:col-span-2">
          <Button type="submit">Generate Petition</Button>
        </div>
      </form>
    </Card>
  );
}
