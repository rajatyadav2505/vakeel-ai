import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchEcourtsCaseSnapshot } from '@/lib/ecourts';

const schema = z.object({
  cnrNumber: z.string().min(6),
  caseId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`ecourts-sync:${user.userId}`, 120);
    const payload = schema.parse(await request.json());
    const supabase = createSupabaseServerClient();
    const fetched = await fetchEcourtsCaseSnapshot(payload.cnrNumber);

    if (!fetched.configured) {
      return NextResponse.json(
        {
          error:
            'Live e-Courts adapter is not configured. Set ECOURTS_CASE_STATUS_URL to enable sync.',
        },
        { status: 503 }
      );
    }

    if (!fetched.snapshot) {
      const eventInsert = await supabase.from('ecourts_sync_events').insert({
        owner_user_id: user.userId,
        case_id: payload.caseId ?? null,
        cnr_number: payload.cnrNumber,
        status: 'failed',
        source: 'ecourts',
        error_message: 'No usable case data was returned by the configured adapter.',
      });
      if (eventInsert.error) {
        console.warn('[ecourts] failed to persist sync failure event:', eventInsert.error.message);
      }

      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          message: 'No usable case data was returned by the configured e-Courts adapter.',
        },
        { status: 502 }
      );
    }

    const snapshot = fetched.snapshot;
    const caseUpdate: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (snapshot.courtName) caseUpdate.court_name = snapshot.courtName;
    if (snapshot.normalizedCaseStage) caseUpdate.stage = snapshot.normalizedCaseStage;
    if (snapshot.cnrNumber) caseUpdate.cnr_number = snapshot.cnrNumber;

    if (payload.caseId) {
      await supabase
        .from('cases')
        .update(caseUpdate)
        .eq('id', payload.caseId)
        .eq('owner_user_id', user.userId);
    }

    const syncInsert = await supabase.from('ecourts_sync_events').insert({
      owner_user_id: user.userId,
      case_id: payload.caseId ?? null,
      cnr_number: snapshot.cnrNumber,
      status: 'synced',
      source: 'ecourts',
      stage: snapshot.stage,
      court_name: snapshot.courtName,
      next_hearing_date: snapshot.nextHearingDate,
      payload: {
        caseStatus: snapshot.caseStatus,
        caseTitle: snapshot.caseTitle,
        sourceUrl: snapshot.sourceUrl,
        raw: snapshot.raw,
      },
    });
    if (syncInsert.error) {
      console.warn('[ecourts] failed to persist sync event:', syncInsert.error.message);
    }

    return NextResponse.json({
      ok: true,
      status: 'synced',
      cnrNumber: snapshot.cnrNumber,
      caseId: payload.caseId ?? null,
      stage: snapshot.stage,
      normalizedCaseStage: snapshot.normalizedCaseStage,
      caseStatus: snapshot.caseStatus,
      courtName: snapshot.courtName,
      caseTitle: snapshot.caseTitle,
      nextHearingDate: snapshot.nextHearingDate,
      sourceUrl: snapshot.sourceUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
