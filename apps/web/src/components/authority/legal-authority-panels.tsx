import { ExternalLink } from 'lucide-react';
import type {
  ConflictAuthority,
  GroundedLegalClaim,
  LegalResearchPacket,
  PrecedentAuthority,
  StatutoryAuthority,
} from '@nyaya/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function AuthorityListItem(props: {
  authority: StatutoryAuthority | PrecedentAuthority;
  bucket: 'statute' | 'leading' | 'latest';
}) {
  const { authority } = props;
  return (
    <a
      href={authority.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium group-hover:text-primary">{authority.title}</p>
        <div className="flex items-center gap-1">
          <Badge>{props.bucket}</Badge>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{authority.proposition}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {authority.authorityType === 'precedent'
          ? `${authority.court} • ${authority.date} • relevance ${Math.round(authority.overallScore * 100)}%`
          : `${authority.actName}${authority.sectionRef ? ` • ${authority.sectionRef}` : ''} • relevance ${Math.round(authority.overallScore * 100)}%`}
      </p>
    </a>
  );
}

function GroundedClaims(props: { claims: GroundedLegalClaim[]; unverifiedClaims: GroundedLegalClaim[] }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-[Georgia] text-base font-semibold">Grounded legal claims</h2>
      {(props.claims ?? []).map((claim) => (
        <div key={claim.id} className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">{claim.statement}</p>
            <Badge>{claim.supportType}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Issue: {claim.issueTag}</p>
        </div>
      ))}
      {(props.unverifiedClaims ?? []).map((claim) => (
        <div key={claim.id} className="rounded-xl border border-amber-300/50 bg-amber-50/40 p-3 dark:bg-amber-900/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">{claim.statement}</p>
            <Badge>unverified</Badge>
          </div>
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            {claim.unverifiedReason ?? 'No verified authority found.'}
          </p>
        </div>
      ))}
      {(props.claims.length === 0 && props.unverifiedClaims.length === 0) && (
        <p className="text-sm text-muted-foreground">No legal claims were generated for this run.</p>
      )}
    </Card>
  );
}

function Conflicts(props: { conflicts: ConflictAuthority[] }) {
  if (!props.conflicts.length) return null;
  return (
    <Card className="space-y-2">
      <h2 className="font-[Georgia] text-base font-semibold">Conflicting authorities</h2>
      {props.conflicts.map((conflict) => (
        <div key={conflict.id} className="rounded-xl border border-border bg-background p-3">
          <p className="text-sm font-medium">{conflict.issueTag}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{conflict.summary}</p>
        </div>
      ))}
    </Card>
  );
}

export function LegalAuthorityPanels(props: {
  legalResearchPacket: LegalResearchPacket | null;
  groundedClaims: GroundedLegalClaim[];
  unverifiedClaims: GroundedLegalClaim[];
  conflicts: ConflictAuthority[];
  legalGroundingStatus: 'complete' | 'incomplete';
}) {
  if (!props.legalResearchPacket) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          No legal research packet was attached to this run.
        </p>
      </Card>
    );
  }

  const packet = props.legalResearchPacket;
  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[Georgia] text-base font-semibold">Indian legal grounding</h2>
          <Badge>{props.legalGroundingStatus}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          precedentsCheckedAt: {packet.precedentsCheckedAt} • coverage: {Math.round(packet.authorityCoverageScore * 100)}%
        </p>
        <p className="text-xs text-muted-foreground">
          Issues: {packet.issuesIdentified.join(', ') || 'none'}
        </p>
        {packet.unresolvedIssues.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Unresolved issues: {packet.unresolvedIssues.join(', ')}
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-[Georgia] text-base font-semibold">Statutory authorities</h2>
        {(packet.statutoryAuthorities ?? []).slice(0, 8).map((authority) => (
          <AuthorityListItem key={authority.id} authority={authority} bucket="statute" />
        ))}
        {packet.statutoryAuthorities.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No verified Indian statutory authority found for identified issues.
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-[Georgia] text-base font-semibold">Leading precedents</h2>
        {(packet.leadingPrecedents ?? []).slice(0, 8).map((authority) => (
          <AuthorityListItem key={authority.id} authority={authority} bucket="leading" />
        ))}
        {packet.leadingPrecedents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No verified controlling precedent found for identified issues.
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-[Georgia] text-base font-semibold">Latest precedents</h2>
        {(packet.latestPrecedents ?? []).slice(0, 8).map((authority) => (
          <AuthorityListItem key={authority.id} authority={authority} bucket="latest" />
        ))}
        {packet.latestPrecedents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No verified recent precedent found in the latest lookback window.
          </p>
        )}
      </Card>

      <GroundedClaims claims={props.groundedClaims} unverifiedClaims={props.unverifiedClaims} />
      <Conflicts conflicts={props.conflicts} />
    </div>
  );
}
