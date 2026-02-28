import { createCaseAction } from '@/app/actions/cases';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function NewCasePage() {
  return (
    <Card className="space-y-4">
      <div>
        <h1 className="font-[Georgia] text-xl font-semibold">Case Intake</h1>
        <p className="text-sm text-muted-foreground">
          Upload PDFs, voice notes, and core details for AI strategy processing.
        </p>
      </div>

      <form action={createCaseAction} className="grid gap-4 md:grid-cols-2">
        <Label>
          Case title
          <Input name="title" required placeholder="State vs X / Civil writ title" />
        </Label>

        <Label>
          Case type
          <Select name="caseType" defaultValue="civil">
            <option value="civil">Civil</option>
            <option value="criminal">Criminal</option>
            <option value="constitutional">Constitutional</option>
            <option value="family">Family</option>
            <option value="labor">Labor</option>
            <option value="consumer">Consumer</option>
            <option value="tax">Tax</option>
          </Select>
        </Label>

        <Label>
          CNR number
          <Input name="cnrNumber" placeholder="e.g. DLCT010012342025" />
        </Label>

        <Label>
          Court
          <Input name="courtName" placeholder="Delhi High Court" />
        </Label>

        <Label>
          Client name
          <Input name="clientName" placeholder="Petitioner/client" />
        </Label>

        <Label>
          Opponent name
          <Input name="opponentName" placeholder="Respondent/opponent" />
        </Label>

        <Label>
          Jurisdiction
          <Input name="jurisdiction" placeholder="NCT Delhi" />
        </Label>

        <Label>
          Intake PDF
          <Input name="casePdf" type="file" accept=".pdf" />
        </Label>

        <Label>
          Voice note (for Whisper pipeline)
          <Input name="voiceNote" type="file" accept="audio/*" />
        </Label>

        <Label className="md:col-span-2">
          Matter summary
          <Textarea
            name="summary"
            rows={6}
            required
            placeholder="Facts, chronology, alleged violations, and desired outcome."
          />
        </Label>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input name="lawyerVerifiedForExport" type="checkbox" className="h-4 w-4 rounded border-border accent-primary" />
          I confirm lawyer verification will be mandatory before export/file generation.
        </label>

        <div className="md:col-span-2">
          <Button type="submit">Create Case</Button>
        </div>
      </form>
    </Card>
  );
}
